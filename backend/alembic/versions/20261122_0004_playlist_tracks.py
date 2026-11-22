"""playlist_tracks

Revision ID: 20261122_0004
Revises: 20261003_0003
Create Date: 2026-11-22 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261122_0004"
down_revision: Union[str, None] = "20261003_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "playlist_tracks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("playlist_id", sa.String(), nullable=False),
        sa.Column("track_uri", sa.String(), nullable=False),
        sa.Column("added_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_playlist_tracks_playlist_id", "playlist_tracks", ["playlist_id"])


def downgrade() -> None:
    op.drop_index("ix_playlist_tracks_playlist_id", table_name="playlist_tracks")
    op.drop_table("playlist_tracks")
