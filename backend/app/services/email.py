import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

MAX_RETRIES = 5
SMTP_TIMEOUT = 30
load_dotenv()

logger = logging.getLogger(__name__)

# Email Configuration
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "noreply@invoicechain.com")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
MAX_RETRIES = 3


def _get_smtp_connection():
    """
    Create SMTP connection with retry logic.
    
    Returns:
        SMTP connection object or None if failed after retries
    """
    for attempt in range(MAX_RETRIES):
        try:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT)
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            logger.info("SMTP connection established")
            return server
        except smtplib.SMTPException as e:
            logger.warning(f"SMTP connection attempt {attempt + 1} failed: {str(e)}")
            if attempt == MAX_RETRIES - 1:
                logger.error("Failed to establish SMTP connection after retries")
                return None
    return None


def _send_email(to_email: str, subject: str, html_body: str) -> bool:
    """
    Generic email sending function.
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        html_body: HTML email body
        
    Returns:
        True if email sent successfully, False otherwise
    """
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        logger.error("SMTP credentials not configured")
        return False
    
    try:
        server = _get_smtp_connection()
        if not server:
            return False
        
        # Create message
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = SENDER_EMAIL
        message["To"] = to_email
        
        # Attach HTML body
        html_part = MIMEText(html_body, "html")
        message.attach(html_part)
        
        # Send email
        server.sendmail(SENDER_EMAIL, to_email, message.as_string())
        server.quit()
        
        logger.info(f"Email sent successfully to {to_email}")
        return True
        
    except smtplib.SMTPException as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending email to {to_email}: {str(e)}")
        return False


def _get_email_header() -> str:
    """Get email header with logo and styling"""
    return """
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-bottom: 2px solid #007bff;">
            <h1 style="color: #003d82; margin: 0;">InvoiceChain</h1>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 12px;">Blockchain-Based Invoice Factoring Platform</p>
        </div>
        <div style="padding: 30px 20px;">
    """


def _get_email_footer() -> str:
    """Get email footer with company info"""
    return """
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
            <p style="margin: 0;">© 2026 InvoiceChain. All rights reserved.</p>
            <p style="margin: 5px 0 0 0;">
                <a href="https://invoicechain.com" style="color: #007bff; text-decoration: none;">Website</a> | 
                <a href="https://invoicechain.com/privacy" style="color: #007bff; text-decoration: none;">Privacy</a> | 
                <a href="https://invoicechain.com/terms" style="color: #007bff; text-decoration: none;">Terms</a>
            </p>
        </div>
    </div>
    """


def send_verification_email(user_email: str, verification_token: str) -> bool:
    """
    Send email verification link to user.
    
    Args:
        user_email: User's email address
        verification_token: One-time verification token
        
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Build verification link pointing to backend so cookies can be set server-side
        verification_link = f"{BACKEND_URL}/auth/verify-email?token={verification_token}"
        
        # Build HTML body
        html_body = (
            _get_email_header()
            + f"""
            <h2 style="color: #003d82; margin-top: 0;">Verify Your Email</h2>
            <p style="color: #333; line-height: 1.6;">
                Welcome to InvoiceChain! We're excited to have you on board.
            </p>
            <p style="color: #333; line-height: 1.6;">
                Please verify your email address by clicking the button below:
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{verification_link}" 
                   style="background-color: #007bff; color: white; padding: 12px 30px; 
                           text-decoration: none; border-radius: 5px; display: inline-block; 
                           font-weight: bold;">
                    Verify Email
                </a>
            </div>
            <p style="color: #666; font-size: 12px;">
                Or copy and paste this link in your browser:<br>
                <a href="{verification_link}" style="color: #007bff; word-break: break-all;">
                    {verification_link}
                </a>
            </p>
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
                This link will expire in 24 hours.
            </p>
            <p style="color: #999; font-size: 11px; margin-top: 30px;">
                If you didn't create this account, please ignore this email.
            </p>
            """
            + _get_email_footer()
        )
        
        return _send_email(
            user_email,
            "Verify Your InvoiceChain Email",
            html_body
        )
        
    except Exception as e:
        logger.error(f"Error preparing verification email for {user_email}: {str(e)}")
        return False


def send_password_reset_email(user_email: str, reset_token: str) -> bool:
    """
    Send password reset link to user.
    
    Args:
        user_email: User's email address
        reset_token: One-time password reset token
        
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Build reset link
        reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"
        
        # Build HTML body
        html_body = (
            _get_email_header()
            + f"""
            <h2 style="color: #003d82; margin-top: 0;">Reset Your Password</h2>
            <p style="color: #333; line-height: 1.6;">
                We received a request to reset your InvoiceChain password.
            </p>
            <p style="color: #333; line-height: 1.6;">
                Click the button below to create a new password:
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_link}" 
                   style="background-color: #007bff; color: white; padding: 12px 30px; 
                           text-decoration: none; border-radius: 5px; display: inline-block; 
                           font-weight: bold;">
                    Reset Password
                </a>
            </div>
            <p style="color: #666; font-size: 12px;">
                Or copy and paste this link in your browser:<br>
                <a href="{reset_link}" style="color: #007bff; word-break: break-all;">
                    {reset_link}
                </a>
            </p>
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
                This link will expire in 1 hour.
            </p>
            <p style="color: #999; font-size: 11px; margin-top: 30px;">
                If you didn't request a password reset, please ignore this email or contact support.
            </p>
            """
            + _get_email_footer()
        )
        
        return _send_email(
            user_email,
            "Reset Your InvoiceChain Password",
            html_body
        )
        
    except Exception as e:
        logger.error(f"Error preparing password reset email for {user_email}: {str(e)}")
        return False
