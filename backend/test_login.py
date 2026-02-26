import requests
import json

data = {
    "username": "teachernoblenexus@gmail.com",
    "password": "Tea444@tea",
    "role": "Teacher"
}
response = requests.post("http://127.0.0.1:8000/api/auth/login", json=data)
print(response.status_code)
print(response.text)
