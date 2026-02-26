import logging
import json
from datetime import datetime
import sys

class JSONFormatter(logging.Formatter):
    """
    Formatter that outputs JSON strings after parsing the LogRecord.
    """
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        if record.exc_info:
            log_data["exc_info"] = self.formatException(record.exc_info)
            
        return json.dumps(log_data)

def setup_structured_logging(level=logging.INFO):
    """
    Configures the root logger to output JSON structured logs to stdout.
    """
    logger = logging.getLogger()
    
    # Remove all existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
        
    logger.setLevel(level)
    
    log_handler = logging.StreamHandler(sys.stdout)
    log_handler.setFormatter(JSONFormatter())
    
    logger.addHandler(log_handler)
    
    # Optional: silence noisy third-party loggers if needed
    # logging.getLogger("urllib3").setLevel(logging.WARNING)

    return logger
