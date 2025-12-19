"""
TriLog CLI - Command-line interface for deployment and management

Commands:
  deploy   - Deploy TriLog to Kubernetes
  destroy  - Remove TriLog from Kubernetes
  status   - Check deployment status
  logs     - View logs from components
  registry - Manage schema registries
"""

import sys
import subprocess
import json
import time
from pathlib import Path
from typing import Optional, List, Dict, Any

import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich import print as rprint
from tabulate import tabulate

from trilog.dsl.registry import Registry, RegistryExporter


console = Console()


class CliError(Exception):
    """CLI-specific error"""
    pass


def run_kubectl(*args, namespace: Optional[str] = None, capture: bool = True) -> str:
    """
    Wrapper around kubectl command

    Args:
        *args: kubectl arguments
        namespace: Optional namespace
        capture: If True, capture output; otherwise stream to console

    Returns:
        Command output (if capture=True)
    """
    cmd = ["kubectl"]
    if namespace:
        cmd.extend(["-n", namespace])
    cmd.extend(args)

    try:
        if capture:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout
        else:
            subprocess.run(cmd, check=True)
            return ""
    except subprocess.CalledProcessError as e:
        if capture and e.stderr:
            raise CliError(f"kubectl error: {e.stderr}")
        raise CliError(f"kubectl command failed: {' '.join(cmd)}")
    except FileNotFoundError:
        raise CliError("kubectl not found - please install kubectl and ensure it's in your PATH")


def check_kubectl_available() -> bool:
    """Check if kubectl is available"""
    try:
        subprocess.run(
            ["kubectl", "version", "--client"],
            capture_output=True,
            check=True
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def wait_for_pods_ready(namespace: str, label_selector: str, timeout: int = 300) -> bool:
    """
    Wait for pods to be ready

    Args:
        namespace: Kubernetes namespace
        label_selector: Pod label selector (e.g., "app=trilog-clickhouse")
        timeout: Timeout in seconds

    Returns:
        True if pods are ready, False if timeout
    """
    start_time = time.time()

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console
    ) as progress:
        task = progress.add_task(f"Waiting for pods ({label_selector})...", total=None)

        while (time.time() - start_time) < timeout:
            try:
                output = run_kubectl(
                    "get", "pods",
                    "-l", label_selector,
                    "-o", "jsonpath={.items[*].status.conditions[?(@.type=='Ready')].status}",
                    namespace=namespace
                )

                statuses = output.strip().split()
                if statuses and all(s == "True" for s in statuses):
                    progress.update(task, completed=True)
                    return True

            except CliError:
                pass

            time.sleep(5)

        return False


@click.group()
@click.version_option(version="1.1.0", prog_name="trilog")
def cli():
    """TriLog - Model-Driven Observability System"""
    # Check kubectl availability
    if not check_kubectl_available():
        console.print("[yellow]Warning: kubectl not found. K8s commands will not work.[/yellow]")


@cli.command()
@click.option("--env", default="dev", type=click.Choice(["dev", "staging", "production"]),
              help="Environment to deploy")
@click.option("--namespace", default="trilog-system", help="Kubernetes namespace")
@click.option("--kubeconfig", help="Path to kubeconfig file")
@click.option("--dry-run", is_flag=True, help="Show what would be deployed without actually deploying")
def deploy(env: str, namespace: str, kubeconfig: Optional[str], dry_run: bool):
    """Deploy TriLog to Kubernetes"""

    console.print(Panel.fit(
        f"[bold cyan]Deploying TriLog[/bold cyan]\n\n"
        f"Environment: {env}\n"
        f"Namespace: {namespace}\n"
        f"Dry Run: {dry_run}",
        border_style="cyan"
    ))

    # Get project root
    project_root = Path(__file__).parent.parent
    k8s_overlay_path = project_root / "k8s" / "overlays" / env

    if not k8s_overlay_path.exists():
        console.print(f"[red]Error: K8s overlay not found at {k8s_overlay_path}[/red]")
        sys.exit(1)

    try:
        # Step 1: Create namespace if it doesn't exist
        console.print("\n[bold]Step 1/5:[/bold] Creating namespace...")
        try:
            run_kubectl("get", "namespace", namespace)
            console.print(f"✓ Namespace '{namespace}' already exists")
        except CliError:
            namespace_yaml = project_root / "k8s" / "namespace.yaml"
            if dry_run:
                console.print(f"[dim]Would create namespace from {namespace_yaml}[/dim]")
            else:
                run_kubectl("apply", "-f", str(namespace_yaml))
                console.print(f"✓ Created namespace '{namespace}'")

        # Step 2: Apply Kustomize overlay
        console.print("\n[bold]Step 2/5:[/bold] Applying Kustomize configuration...")
        kubectl_args = ["apply", "-k", str(k8s_overlay_path)]
        if dry_run:
            kubectl_args.append("--dry-run=client")

        run_kubectl(*kubectl_args, capture=False)
        console.print("✓ Applied Kubernetes manifests")

        if dry_run:
            console.print("\n[yellow]Dry run completed - no changes were made[/yellow]")
            return

        # Step 3: Wait for ClickHouse to be ready
        console.print("\n[bold]Step 3/5:[/bold] Waiting for ClickHouse...")
        if wait_for_pods_ready(namespace, "app=trilog-clickhouse", timeout=300):
            console.print("✓ ClickHouse is ready")
        else:
            console.print("[yellow]⚠ ClickHouse not ready after 5 minutes - check pod status[/yellow]")

        # Step 4: Wait for OTel Collector to be ready
        console.print("\n[bold]Step 4/5:[/bold] Waiting for OTel Collector...")
        if wait_for_pods_ready(namespace, "app=trilog-otel-collector", timeout=180):
            console.print("✓ OTel Collector is ready")
        else:
            console.print("[yellow]⚠ OTel Collector not ready after 3 minutes - check pod status[/yellow]")

        # Step 5: Display connection information
        console.print("\n[bold]Step 5/5:[/bold] Getting connection info...")
        try:
            # Get OTel Collector service
            otel_svc = run_kubectl(
                "get", "service", "trilog-otel-collector",
                "-o", "jsonpath={.spec.clusterIP}",
                namespace=namespace
            )

            # Get ClickHouse service
            ch_svc = run_kubectl(
                "get", "service", "trilog-clickhouse",
                "-o", "jsonpath={.spec.clusterIP}",
                namespace=namespace
            )

            console.print("\n[bold green]✓ Deployment successful![/bold green]\n")

            # Connection info table
            table = Table(title="Connection Information", show_header=True, header_style="bold cyan")
            table.add_column("Service", style="cyan")
            table.add_column("Endpoint", style="green")
            table.add_column("Usage", style="dim")

            table.add_row(
                "OTel Collector (gRPC)",
                f"{otel_svc}:4317",
                "OTLP gRPC endpoint for applications"
            )
            table.add_row(
                "OTel Collector (HTTP)",
                f"{otel_svc}:4318",
                "OTLP HTTP endpoint for applications"
            )
            table.add_row(
                "ClickHouse (Native)",
                f"{ch_svc}:9000",
                "Native protocol for queries"
            )
            table.add_row(
                "ClickHouse (HTTP)",
                f"{ch_svc}:8123",
                "HTTP interface for queries"
            )

            console.print(table)

            console.print("\n[bold]Next steps:[/bold]")
            console.print("1. Configure your application to send logs to the OTel Collector")
            console.print("2. Use trilog.context.setup_otel() to initialize OpenTelemetry")
            console.print(f"3. Run 'trilog status --namespace {namespace}' to check system health")

        except CliError as e:
            console.print(f"[yellow]Warning: Could not retrieve connection info: {e}[/yellow]")

    except CliError as e:
        console.print(f"\n[red]Deployment failed: {e}[/red]")
        sys.exit(1)


@cli.command()
@click.option("--env", default="dev", type=click.Choice(["dev", "staging", "production"]),
              help="Environment to destroy")
@click.option("--namespace", default="trilog-system", help="Kubernetes namespace")
@click.option("--yes", is_flag=True, help="Skip confirmation prompt")
def destroy(env: str, namespace: str, yes: bool):
    """Remove TriLog from Kubernetes"""

    if not yes:
        console.print(f"[yellow]This will delete all TriLog resources in namespace '{namespace}'[/yellow]")
        console.print("[yellow]This action cannot be undone![/yellow]")
        if not click.confirm("Are you sure you want to continue?"):
            console.print("Aborted.")
            return

    console.print(Panel.fit(
        f"[bold red]Destroying TriLog[/bold red]\n\n"
        f"Environment: {env}\n"
        f"Namespace: {namespace}",
        border_style="red"
    ))

    project_root = Path(__file__).parent.parent
    k8s_overlay_path = project_root / "k8s" / "overlays" / env

    try:
        # Delete resources using Kustomize
        console.print("\nDeleting Kubernetes resources...")
        run_kubectl("delete", "-k", str(k8s_overlay_path), "--ignore-not-found=true", capture=False)
        console.print("✓ Deleted TriLog resources")

        # Optionally delete namespace
        if click.confirm(f"Delete namespace '{namespace}' as well?"):
            run_kubectl("delete", "namespace", namespace, "--ignore-not-found=true")
            console.print(f"✓ Deleted namespace '{namespace}'")

        console.print("\n[bold green]✓ TriLog destroyed successfully[/bold green]")

    except CliError as e:
        console.print(f"\n[red]Destroy failed: {e}[/red]")
        sys.exit(1)


@cli.command()
@click.option("--namespace", default="trilog-system", help="Kubernetes namespace")
@click.option("--watch", "-w", is_flag=True, help="Watch status continuously")
def status(namespace: str, watch: bool):
    """Check TriLog deployment status"""

    try:
        while True:
            # Get pod status
            output = run_kubectl(
                "get", "pods",
                "-o", "json",
                namespace=namespace
            )

            pods_data = json.loads(output)

            if not pods_data.get("items"):
                console.print(f"[yellow]No pods found in namespace '{namespace}'[/yellow]")
                console.print("Run 'trilog deploy' to install TriLog")
                return

            # Create status table
            table = Table(title=f"TriLog Status ({namespace})", show_header=True, header_style="bold cyan")
            table.add_column("Component", style="cyan")
            table.add_column("Status", style="green")
            table.add_column("Ready", justify="center")
            table.add_column("Restarts", justify="center")
            table.add_column("Age")

            for pod in pods_data["items"]:
                name = pod["metadata"]["name"]
                status_info = pod["status"]

                # Component name (strip pod hash)
                component = name.rsplit("-", 2)[0] if "-" in name else name

                # Status
                phase = status_info.get("phase", "Unknown")

                # Ready status
                ready_conditions = [
                    c for c in status_info.get("conditions", [])
                    if c["type"] == "Ready"
                ]
                ready = "Yes" if ready_conditions and ready_conditions[0]["status"] == "True" else "No"

                # Restarts
                restarts = sum(
                    cs.get("restartCount", 0)
                    for cs in status_info.get("containerStatuses", [])
                )

                # Age
                start_time = pod["metadata"].get("creationTimestamp", "")
                age = start_time  # Simplified - could calculate actual age

                # Color based on status
                status_style = "green" if phase == "Running" else "yellow"
                ready_style = "green" if ready == "Yes" else "red"

                table.add_row(
                    component,
                    f"[{status_style}]{phase}[/{status_style}]",
                    f"[{ready_style}]{ready}[/{ready_style}]",
                    str(restarts),
                    age
                )

            console.clear() if watch else None
            console.print(table)

            # Get service endpoints
            console.print("\n[bold]Service Endpoints:[/bold]")
            try:
                svc_output = run_kubectl(
                    "get", "services",
                    "-o", "custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,PORTS:.spec.ports[*].port",
                    namespace=namespace
                )
                console.print(svc_output)
            except CliError:
                console.print("[yellow]Could not retrieve service information[/yellow]")

            if not watch:
                break

            time.sleep(5)

    except CliError as e:
        console.print(f"\n[red]Status check failed: {e}[/red]")
        sys.exit(1)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopped watching[/yellow]")


@cli.command()
@click.option("--namespace", default="trilog-system", help="Kubernetes namespace")
@click.option("--component", type=click.Choice(["clickhouse", "otel-collector", "all"]),
              default="all", help="Component to view logs from")
@click.option("--follow", "-f", is_flag=True, help="Follow log output")
@click.option("--tail", default=100, help="Number of lines to show from the end")
def logs(namespace: str, component: str, follow: bool, tail: int):
    """View logs from TriLog components"""

    try:
        # Map component to label selector
        selectors = {
            "clickhouse": "app=trilog-clickhouse",
            "otel-collector": "app=trilog-otel-collector",
            "all": "app.kubernetes.io/part-of=trilog"
        }

        label_selector = selectors[component]

        console.print(f"[cyan]Fetching logs for {component}...[/cyan]\n")

        # Build kubectl logs command
        args = [
            "logs",
            "-l", label_selector,
            f"--tail={tail}",
            "--prefix=true",  # Show pod name prefix
        ]

        if follow:
            args.append("--follow")

        # Stream logs to console
        run_kubectl(*args, namespace=namespace, capture=False)

    except CliError as e:
        console.print(f"\n[red]Failed to retrieve logs: {e}[/red]")
        sys.exit(1)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopped following logs[/yellow]")


@cli.group()
def registry():
    """Manage TriLog schema registries"""
    pass


@registry.command("export")
@click.option("--format", type=click.Choice(["json", "typescript", "configmap"]),
              default="json", help="Export format")
@click.option("--output", help="Output file path (default: stdout)")
@click.option("--name", default="default", help="Registry name")
@click.option("--version", default="1.0.0", help="Registry version")
def registry_export(format: str, output: Optional[str], name: str, version: str):
    """Export registry in various formats"""

    try:
        # Create registry and auto-register all objects
        reg = Registry(name=name, version=version)
        reg.register_all()

        # Export in requested format
        exporter = RegistryExporter(reg)

        if format == "json":
            content = exporter.to_json(pretty=True)
        elif format == "typescript":
            content = exporter.to_typescript()
        elif format == "configmap":
            content = reg.to_configmap_yaml()
        else:
            raise CliError(f"Unsupported format: {format}")

        # Output to file or stdout
        if output:
            output_path = Path(output)
            output_path.write_text(content)
            console.print(f"[green]✓ Exported registry to {output_path}[/green]")
        else:
            console.print(content)

        # Show summary
        console.print(f"\n[dim]Registry: {name} v{version}[/dim]")
        console.print(f"[dim]Objects: {len(reg.get_all_objects())}[/dim]")
        console.print(f"[dim]Processes: {len(reg.get_all_processes())}[/dim]")

    except Exception as e:
        console.print(f"\n[red]Export failed: {e}[/red]")
        sys.exit(1)


@registry.command("validate")
@click.argument("registry_file", type=click.Path(exists=True))
def registry_validate(registry_file: str):
    """Validate a registry file"""

    try:
        console.print(f"[cyan]Validating {registry_file}...[/cyan]\n")

        # Load registry
        reg = Registry.load(Path(registry_file))

        # Validate structure
        data = json.loads(Path(registry_file).read_text())

        # Check required fields
        required_fields = ["registry", "objects"]
        missing = [f for f in required_fields if f not in data]

        if missing:
            console.print(f"[red]✗ Missing required fields: {', '.join(missing)}[/red]")
            sys.exit(1)

        # Display info
        table = Table(title="Registry Information", show_header=False)
        table.add_column("Field", style="cyan")
        table.add_column("Value", style="green")

        reg_info = data["registry"]
        table.add_row("Name", reg_info.get("name", "N/A"))
        table.add_row("Version", reg_info.get("version", "N/A"))
        table.add_row("Created At", reg_info.get("created_at", "N/A"))
        table.add_row("Objects", str(len(data.get("objects", {}))))
        table.add_row("Processes", str(len(data.get("processes", {}))))

        console.print(table)
        console.print("\n[green]✓ Registry is valid[/green]")

    except Exception as e:
        console.print(f"\n[red]Validation failed: {e}[/red]")
        sys.exit(1)


@registry.command("gen-types")
@click.option("--input", required=True, type=click.Path(exists=True), help="Path to registry.json")
@click.option("--output", required=True, help="Output TypeScript definitions file")
def gen_types(input: str, output: str):
    """Generate TypeScript types from registry"""

    try:
        console.print(f"[cyan]Generating TypeScript types from {input}...[/cyan]\n")

        # Load registry
        reg = Registry.load(Path(input))
        exporter = RegistryExporter(reg)

        # Generate TypeScript types
        ts_types = exporter.to_typescript()

        # Write to output file
        output_path = Path(output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(ts_types)

        console.print(f"[green]✓ Generated TypeScript types: {output_path}[/green]")
        console.print(f"[dim]Objects: {len(reg.get_all_objects())}[/dim]")
        console.print(f"[dim]Processes: {len(reg.get_all_processes())}[/dim]")

    except Exception as e:
        console.print(f"\n[red]Type generation failed: {e}[/red]")
        sys.exit(1)


if __name__ == "__main__":
    cli()
