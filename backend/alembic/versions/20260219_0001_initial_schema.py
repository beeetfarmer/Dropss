"""initial_schema

Revision ID: 20260219_0001
Revises:
Create Date: 2026-02-19 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260219_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "artists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("spotify_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("spotify_url", sa.String(), nullable=False),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("added_at", sa.DateTime(), nullable=True),
        sa.Column("last_checked", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_artists_id", "artists", ["id"], unique=False)
    op.create_index("ix_artists_spotify_id", "artists", ["spotify_id"], unique=True)

    op.create_table(
        "releases",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("spotify_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("release_type", sa.String(), nullable=False),
        sa.Column("release_date", sa.String(), nullable=False),
        sa.Column("spotify_url", sa.String(), nullable=False),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("total_tracks", sa.Integer(), nullable=True),
        sa.Column("artist_id", sa.Integer(), nullable=False),
        sa.Column("is_new", sa.Boolean(), nullable=True),
        sa.Column("notified", sa.Boolean(), nullable=True),
        sa.Column("discovered_at", sa.DateTime(), nullable=True),
        sa.Column("in_jellyfin", sa.Boolean(), nullable=True),
        sa.Column("jellyfin_match_type", sa.String(), nullable=True),
        sa.Column("jellyfin_match_confidence", sa.Float(), nullable=True),
        sa.Column("jellyfin_album_id", sa.String(), nullable=True),
        sa.Column("in_plex", sa.Boolean(), nullable=True),
        sa.Column("plex_match_type", sa.String(), nullable=True),
        sa.Column("plex_match_confidence", sa.Float(), nullable=True),
        sa.Column("plex_album_id", sa.String(), nullable=True),
        sa.Column("tracks", sa.JSON(), nullable=True),
        sa.Column("available_tracks", sa.JSON(), nullable=True),
        sa.Column("missing_tracks", sa.JSON(), nullable=True),
        sa.Column("plex_available_tracks", sa.JSON(), nullable=True),
        sa.Column("plex_missing_tracks", sa.JSON(), nullable=True),
        sa.Column("in_navidrome", sa.Boolean(), nullable=True),
        sa.Column("navidrome_match_type", sa.String(), nullable=True),
        sa.Column("navidrome_match_confidence", sa.Float(), nullable=True),
        sa.Column("navidrome_album_id", sa.String(), nullable=True),
        sa.Column("navidrome_available_tracks", sa.JSON(), nullable=True),
        sa.Column("navidrome_missing_tracks", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_releases_id", "releases", ["id"], unique=False)
    op.create_index("ix_releases_spotify_id", "releases", ["spotify_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_releases_spotify_id", table_name="releases")
    op.drop_index("ix_releases_id", table_name="releases")
    op.drop_table("releases")
    op.drop_index("ix_artists_spotify_id", table_name="artists")
    op.drop_index("ix_artists_id", table_name="artists")
    op.drop_table("artists")
