"""
Marketplace seeding script.

Creates the nexus-team user and seeds official panels (chat.nxml, notes.nxml).
Safe to run multiple times (idempotent).
"""

from sqlalchemy.orm import Session
import uuid
import hashlib
from datetime import datetime
from pathlib import Path

import models
import utils
from database import SessionLocal, engine

# Path to NXML panels
# In container: /app/nxml_panels
# In local dev: apps/GraphStudio/src/panels/nxml
NXML_PANELS_DIR = Path("/app/nxml_panels") if Path("/app/nxml_panels").exists() else Path(__file__).parent.parent.parent / "apps/GraphStudio/src/panels/nxml"


def get_or_create_nexus_team_user(db: Session) -> models.User:
    """
    Get or create the nexus-team user.
    
    Args:
        db: Database session
        
    Returns:
        User model for nexus-team
    """
    
    # Check if exists
    user = db.query(models.User).filter(
        models.User.username == "nexus-team"
    ).first()
    
    if user:
        print("[Seed] nexus-team user already exists")
        return user
    
    # Create user
    user_id = str(uuid.uuid4())
    password_hash = utils.get_password_hash("nexus-team-secure-password-" + user_id)
    
    user = models.User(
        id=user_id,
        email="team@nexus.dev",
        username="nexus-team",
        hashed_password=password_hash,
        full_name="Nexus Team",
        is_active=True,
        is_verified=True,
        subscription_tier="enterprise"
    )
    
    db.add(user)
    
    # Create subscription
    subscription = models.Subscription(
        id=str(uuid.uuid4()),
        user_id=user_id,
        plan_name="enterprise",
        is_active=True
    )
    
    db.add(subscription)
    db.commit()
    db.refresh(user)
    
    print(f"[Seed] Created nexus-team user (ID: {user_id})")
    return user


def seed_panel(db: Session, author: models.User, nxml_file: Path) -> bool:
    """
    Seed a single panel from NXML file.
    
    Args:
        db: Database session
        author: User who will be the panel author
        nxml_file: Path to NXML file
        
    Returns:
        True if panel was created or already exists, False on error
    """
    
    # Read NXML source
    try:
        nxml_source = nxml_file.read_text(encoding='utf-8')
    except Exception as e:
        print(f"[Seed] Failed to read {nxml_file.name}: {e}")
        return False
    
    # Generate hash
    nxml_hash = hashlib.sha256(nxml_source.encode()).hexdigest()
    
    # Check if panel already exists (by hash)
    existing = db.query(models.MarketplacePanel).filter(
        models.MarketplacePanel.author_id == author.id,
        models.MarketplacePanel.nxml_hash == nxml_hash
    ).first()
    
    if existing:
        print(f"[Seed] Panel from {nxml_file.name} already exists (ID: {existing.id})")
        return True
    
    # Panel metadata based on filename
    panel_configs = {
        "chat.nxml": {
            "name": "AI Chat",
            "description": "Chat with AI assistants in your workspace. Send messages, get responses, and maintain conversation history.",
            "category": "utilities",
            "icon": "💬",
            "accent_color": "#8B5CF6",
            "tags": "chat,ai,assistant,conversation"
        },
        "notes.nxml": {
            "name": "Notes",
            "description": "Keep organized notes in your workspace. Create, edit, filter, and manage all your notes in one place.",
            "category": "productivity",
            "icon": "📝",
            "accent_color": "#10B981",
            "tags": "notes,productivity,organize,markdown"
        }
    }
    
    config = panel_configs.get(nxml_file.name)
    if not config:
        print(f"[Seed] No config for {nxml_file.name}, skipping")
        return False
    
    # Create panel
    panel = models.MarketplacePanel(
        id=str(uuid.uuid4()),
        author_id=author.id,
        name=config["name"],
        description=config["description"],
        category=config["category"],
        icon=config["icon"],
        accent_color=config["accent_color"],
        nxml_source=nxml_source,
        nxml_hash=nxml_hash,
        tags=config["tags"],
        type="nexus",  # Official panel
        visibility="published",
        version="1.0.0",
        published_at=datetime.utcnow()
    )
    
    db.add(panel)
    db.commit()
    db.refresh(panel)
    
    print(f"[Seed] Created panel '{config['name']}' (ID: {panel.id})")
    return True


def seed_marketplace():
    """Main seeding function."""
    
    print("[Seed] Starting marketplace seeding...")
    
    # Create database session
    db = SessionLocal()
    
    try:
        # 1. Ensure tables exist
        models.Base.metadata.create_all(bind=engine)
        print("[Seed] Database tables verified")
        
        # 2. Get or create nexus-team user
        nexus_team = get_or_create_nexus_team_user(db)
        
        # 3. Seed panels
        nxml_files = [
            NXML_PANELS_DIR / "chat.nxml",
            NXML_PANELS_DIR / "notes.nxml"
        ]
        
        seeded_count = 0
        for nxml_file in nxml_files:
            if not nxml_file.exists():
                print(f"[Seed] Warning: {nxml_file} not found")
                continue
            
            if seed_panel(db, nexus_team, nxml_file):
                seeded_count += 1
        
        print(f"[Seed] Marketplace seeding complete! Seeded {seeded_count} panels")
        
    except Exception as e:
        print(f"[Seed] Error during seeding: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_marketplace()
