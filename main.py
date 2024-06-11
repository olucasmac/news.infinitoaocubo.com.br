from flask import Flask, render_template, jsonify, request, send_file, send_from_directory
import requests
from xml.etree import ElementTree as ET
from io import BytesIO
import re
from datetime import datetime, timezone

app = Flask(__name__, static_url_path='', static_folder='static', template_folder='templates')

def extract_image_from_description(description):
    match = re.search(r'<img[^>]+src="([^">]+)"', description)
    return match.group(1) if match else ''

def parse_pub_date(pub_date):
    try:
        return datetime.strptime(pub_date, '%a, %d %b %Y %H:%M:%S %z')
    except ValueError:
        # Return a very old date with timezone info to ensure proper comparison
        return datetime(1970, 1, 1, tzinfo=timezone.utc)

@app.route('/')
def index():
    print("Rendering index page")
    return render_template('index.html')

@app.route('/feed')
def feed():
    feeds = [
        'https://www.gamevicio.com/rss/noticias.xml',
        'https://br.ign.com/feed.xml',
        'https://rss.tecmundo.com.br/feed',
        'https://canaltech.com.br/rss/',
        'https://pox.globo.com/rss/techtudo/',
        request.url_root + 'personal_feed/meu_feed.xml'  # Adiciona o feed RSS local
    ]

    feed_items = []
    for feed_url in feeds:
        print(f"Fetching feed: {feed_url}")
        response = requests.get(feed_url)
        if response.status_code != 200:
            print(f"Failed to fetch feed: {feed_url} with status code: {response.status_code}")
            continue
        xml = ET.fromstring(response.content)
        channel_title = xml.find('channel/title').text
        is_personal_feed = feed_url == request.url_root + 'personal_feed/meu_feed.xml'
        items = xml.findall('channel/item')

        for item in items:
            categories = [category.text for category in item.findall('category')]
            if any(category.lower() == 'affiliation' for category in categories):
                print(f"Skipping item with title: {item.find('title').text} due to affiliation category")
                continue

            title = item.find('title').text
            link = item.find('link').text
            pub_date = item.find('pubDate').text

            enclosure = item.find('enclosure')
            image_url = enclosure.attrib['url'] if enclosure is not None else ''

            if not image_url:
                description = item.find('description').text
                image_url = extract_image_from_description(description)

            feed_items.append({
                'title': title,
                'link': link,
                'pub_date': pub_date,
                'image_url': image_url,
                'channel_title': channel_title,
                'categories': categories,
                'parsed_date': parse_pub_date(pub_date),
                'is_personal_feed': is_personal_feed  # Adiciona a flag
            })

    feed_items.sort(key=lambda x: x['parsed_date'], reverse=True)

    print(f"Returning {len(feed_items)} feed items")
    return jsonify(feed_items)

@app.route('/image-proxy')
def image_proxy():
    image_url = request.args.get('url')
    if not image_url:
        return "URL is required", 400

    try:
        response = requests.get(image_url)
        if response.status_code != 200:
            return f"Failed to fetch image from {image_url}", response.status_code

        img = BytesIO(response.content)
        return send_file(img, mimetype=response.headers['Content-Type'])
    except Exception as e:
        return str(e), 500

@app.route('/personal_feed/meu_feed.xml')
def serve_feed():
    return send_from_directory('personal_feed', 'meu_feed.xml')

if __name__ == '__main__':
    app.run(debug=True)

# Para uso com functions-framework
def main(request):
    print("Received request")
    with app.request_context(request.environ):
        response = app.full_dispatch_request()
        print(f"Response status: {response.status}")
        return response
