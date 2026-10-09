"""Database engine and session setup."""

from collections.abc import Generator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DB_PATH = Path(__file__).resolve().parent.parent.parent / "odys_ui.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def init_db() -> None:
    """Create all tables if they don't exist."""
    from odys_ui import db_models  # noqa: F401 - registers tables on SQLModel.metadata

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a DB session."""
    with Session(engine) as session:
        yield session
