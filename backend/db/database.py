import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "nutriai_db")

# Construct PostgreSQL URL
SSL_MODE = "" if DB_HOST in ["localhost", "127.0.0.1"] else "?sslmode=require"
SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}{SSL_MODE}"

# We are using echo=True to see the generated SQL in terminal, good for learning/thesis
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    echo=True,
    pool_pre_ping=True,      # Tests connection before using to handle Neon serverless drops
    pool_recycle=300         # Recycle connections every 5 mins
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency for FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
