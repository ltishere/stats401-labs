import requests

url = "https://example.com"
response = requests.get(url, timeout=10)

print(response)
print(response.status_code)
