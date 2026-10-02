"""spotify_account

Revision ID: 20261003_0003
Revises: 20260219_0002
Create Date: 2026-10-03 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261003_0003"
down_revision: Union[str, None] = "20260219_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "spotify_account",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("spotify_user_id", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("redirect_uri", sa.String(), nullable=False),
        sa.Column("token_encrypted", sa.Text(), nullable=False),
        sa.Column("connected_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("spotify_account")
