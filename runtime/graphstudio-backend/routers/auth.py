from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import models
import schemas
import utils
import database
from datetime import timedelta, datetime
from jose import JWTError, jwt
import uuid
import sys
from pathlib import Path
import httpx

# Add trilog imports - using centralized schemas
nexus_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(nexus_root))
from trilog_schemas import User, UserAuthentication
from trilog.context import anchor
from trilog_setup import get_logger

logger = get_logger("graphstudio.auth")

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, utils.SECRET_KEY, algorithms=[utils.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    return user

@router.post("/signup", response_model=schemas.User)
async def signup(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    # Check for existing user
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        logger.warning("signup_duplicate_email", email=user.email)
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    hashed_password = utils.get_password_hash(user.password)
    new_user = models.User(
        id=str(uuid.uuid4()),
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Anchor to new user and log creation
    with anchor(new_user.id, User):
        logger.event("user_created",
            email=user.email,
            full_name=user.full_name
        )
        logger.state_change(
            email=user.email,
            name=user.full_name,
            subscription_tier="free",
            is_active=True,
            created_at=datetime.utcnow().isoformat()
        )

    # Create default free subscription
    new_sub = models.Subscription(id=str(uuid.uuid4()), user_id=new_user.id, plan_name="free")
    db.add(new_sub)
    db.commit()
    db.refresh(new_user)

    # Create default workspace in workspace-kernel
    try:
        # Generate JWT token for the new user to authenticate with workspace-kernel
        access_token = utils.create_access_token(
            data={"sub": new_user.email, "userId": new_user.id, "email": new_user.email},
            expires_delta=timedelta(minutes=30)
        )

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{utils.WORKSPACE_KERNEL_URL}/api/workspaces/",
                json={
                    "name": "My First Workspace",
                    "description": "Your default workspace"
                },
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10.0
            )

            if response.status_code != 201:
                logger.warning("default_workspace_creation_failed",
                    user_id=new_user.id,
                    status_code=response.status_code,
                    error=response.text
                )
            else:
                logger.info("default_workspace_created",
                    user_id=new_user.id,
                    workspace_data=response.json()
                )
    except Exception as e:
        # Log error but don't fail signup if workspace creation fails
        logger.error("default_workspace_creation_error",
            user_id=new_user.id,
            error=str(e)
        )

    return new_user

@router.post("/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()

    if not user:
        logger.warning("login_user_not_found", email=form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not utils.verify_password(form_data.password, user.hashed_password):
        with anchor(user.id, User):
            logger.event("login_failed", reason="invalid_password")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Successful login
    with anchor(user.id, User):
        logger.event("login_success")
        logger.state_change(last_login_at=datetime.utcnow().isoformat())

    access_token_expires = timedelta(minutes=utils.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = utils.create_access_token(
        data={"sub": user.email, "userId": user.id, "email": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user
