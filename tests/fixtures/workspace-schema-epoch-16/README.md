# Epoch 16 migration fixture

The migration test constructs this legacy state deterministically by applying the first sixteen immutable migrations to a temporary SQLite database and setting `schema_epoch=16`. No binary database is checked in, so the fixture is portable across operating systems and SQLite builds.
