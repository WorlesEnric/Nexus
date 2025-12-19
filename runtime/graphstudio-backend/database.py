from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import OperationalError
import os

# Read DATABASE_URL from environment or use default
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../runtime/workspace-kernel/dev.db'))}"
)

# Connect args only for SQLite
connect_args = {"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {}

# For PostgreSQL, add connection pool settings
if "postgresql" in SQLALCHEMY_DATABASE_URL:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args=connect_args,
        pool_pre_ping=True,  # Verify connections before using
        pool_recycle=300,    # Recycle connections after 5 minutes
    )
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args=connect_args
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Get database session with error handling"""
    db = SessionLocal()
    try:
        yield db
    except OperationalError as e:
        db.rollback()
        print(f"[Database] Operational error: {e}")
        raise
    except Exception as e:
        db.rollback()
        print(f"[Database] Unexpected error: {e}")
        raise
    finally:
        db.close()
