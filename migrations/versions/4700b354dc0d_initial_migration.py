"""Initial migration

Revision ID: 4700b354dc0d
Revises: 
Create Date: 2024-06-11 14:35:49.102225

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4700b354dc0d'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('feed_item',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('link', sa.String(), nullable=False),
    sa.Column('pub_date', sa.DateTime(), nullable=False),
    sa.Column('image_url', sa.String(), nullable=True),
    sa.Column('channel_title', sa.String(), nullable=False),
    sa.Column('is_personal_feed', sa.Boolean(), nullable=False),
    sa.Column('categories', sa.String(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('feed_item')
    # ### end Alembic commands ###