import re, urllib.request
url = "https://exrx.net/Lists/ExList/ArmWt"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
print("len", len(html))
print("WeightExercises count", html.count("WeightExercises"))
# sample of hrefs
hrefs = re.findall(r'href=["\']([^"\']+)["\']', html)
we = [h for h in hrefs if "WeightExercises" in h or "weight" in h.lower()]
print("we hrefs", len(we))
print(we[:40])
# any DBCurl
print("DBCurl" in html, "Dumbbell Curl" in html)
