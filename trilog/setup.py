#!/usr/bin/env python3
"""TriLog - Model-Driven Observability System"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README for long description
readme_path = Path(__file__).parent / "README.md"
long_description = readme_path.read_text(encoding="utf-8") if readme_path.exists() else ""

setup(
    name="trilog",
    version="1.1.0",
    author="TriLog Team",
    author_email="team@trilog.dev",
    description="Model-Driven Observability System for Digital Twin Creation",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/trilog/trilog",
    project_urls={
        "Documentation": "https://trilog.dev/docs",
        "Bug Tracker": "https://github.com/trilog/trilog/issues",
    },
    packages=find_packages(exclude=["tests", "tests.*", "examples", "examples.*"]),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: System :: Logging",
        "Topic :: System :: Monitoring",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    python_requires=">=3.9",
    install_requires=[
        "opentelemetry-api>=1.20.0",
        "opentelemetry-sdk>=1.20.0",
        "opentelemetry-exporter-otlp>=1.20.0",
        "clickhouse-driver>=0.2.6",
        "pydantic>=2.0.0",
        "jsonschema>=4.19.0",
        "python-dateutil>=2.8.2",
        "pyyaml>=6.0.1",
        "structlog>=23.1.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.21.0",
            "pytest-cov>=4.1.0",
            "black>=23.7.0",
            "mypy>=1.5.0",
            "ruff>=0.0.285",
        ],
        "ui": [
            "rich>=13.5.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "trilog=trilog.cli:main",
        ],
    },
    include_package_data=True,
    zip_safe=False,
)
