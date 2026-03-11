from passlib.context import CryptContext

# Configure bcrypt hashing context
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"  # Automatically upgrading hash algorithms if needed
)

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
   return pwd_context.verify(plain, hashed)
