-- Creates the isolated test database alongside the main DB
-- Runs automatically when the postgres container first starts

CREATE DATABASE fintech_test_db
    WITH OWNER = fintech_user
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.utf8'
    LC_CTYPE = 'en_US.utf8';

GRANT ALL PRIVILEGES ON DATABASE fintech_test_db TO fintech_user;
