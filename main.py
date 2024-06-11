from flask import Flask, render_template, jsonify, request, send_file, send_from_directory
from flask_caching import Cache
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from apscheduler.schedulers.background import BackgroundScheduler
import requests
from xml.etree import ElementTree as ET
from io import BytesIO
import re
from datetime import datetime, timezone
import atexit

app = Flask(__name__)

# Configuração do cache
app.config['CACHE_TYPE'] = 'redis'
app.config['CACHE_REDIS_HOST'] = 'redis'
app.config['CACHE_REDIS_PORT'] = 6379
app.config['CACHE_REDIS_DB'] = 0
app.config['CACHE_REDIS_URL'] = 'redis://redis:6379/0'
cache = Cache(app)

# Configuração do banco de dados
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://user:password@db:5432/feeds_db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
migrate = Migrate(app, db)

# URL base do feed estático
PERSONAL_FEED_URL = 'https://news.infinitoaocubo.com.br/personal_feed/meu_feed.xml'

class FeedItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String, nullable=False)
    link = db.Column(db.String, nullable=False)
    pub_date = db.Column(db.DateTime, nullable=False)
    image_url = db.Column(db.String, nullable=True)
    channel_title = db.Column(db.String, nullable=False)
    is_personal_feed = db.Column(db.Boolean, nullable=False)
    categories = db.Column(db.String, nullable=True)

    def __repr__(self):
        return f'<FeedItem {self.title}>'

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'link': self.link,
            'pub_date': self.pub_date.isoformat(),
            'image_url': self.image_url,
            'channel_title': self.channel_title,
            'is_personal_feed': self.is_personal_feed,
            'categories': self.categories
        }

def extract_image_from_description(description):
    match = re.search(r'<img[^>]+src="([^">]+)"', description)
    return match.group(1) if match else ''

def parse_pub_date(pub_date):
    try:
        return datetime.strptime(pub_date, '%a, %d %b %Y %H:%M:%S %z')
    except ValueError:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/feed')
def feed():
    feeds = cache.get('feeds')
    if not feeds:
        feeds = fetch_and_cache_feeds()
    return jsonify(feeds)

def fetch_and_cache_feeds():
    feed_urls = [
        'https://www.gamevicio.com/rss/noticias.xml',
        'https://br.ign.com/feed.xml',
        'https://rss.tecmundo.com.br/feed',
        'https://canaltech.com.br/rss/',
        'https://pox.globo.com/rss/techtudo/',  # Novo feed adicionado
        PERSONAL_FEED_URL  # Adiciona o feed RSS local
    ]

    feed_items = []
    for feed_url in feed_urls:
        response = requests.get(feed_url)
        if response.status_code != 200:
            continue
        xml = ET.fromstring(response.content)
        channel_title = xml.find('channel/title').text
        is_personal_feed = feed_url == PERSONAL_FEED_URL
        items = xml.findall('channel/item')

        for item in items:
            categories = item.findall('category')
            if any(category.text.lower() == 'affiliation' for category in categories):
                continue

            title = item.find('title').text
            link = item.find('link').text
            pub_date = item.find('pubDate').text

            enclosure = item.find('enclosure')
            image_url = enclosure.attrib['url'] if enclosure is not None else ''

            if not image_url:
                description = item.find('description').text
                image_url = extract_image_from_description(description)

            categories_text = ','.join([category.text for category in categories])

            feed_item = FeedItem(
                title=title,
                link=link,
                pub_date=parse_pub_date(pub_date),
                image_url=image_url,
                channel_title=channel_title,
                is_personal_feed=is_personal_feed,
                categories=categories_text
            )

            db.session.merge(feed_item)
            feed_items.append(feed_item)

    db.session.commit()
    feed_items.sort(key=lambda x: x.pub_date, reverse=True)
    cache.set('feeds', [item.to_dict() for item in feed_items], timeout=3600)
    return [item.to_dict() for item in feed_items]

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

# Configuração do APScheduler
scheduler = BackgroundScheduler()
scheduler.add_job(func=fetch_and_cache_feeds, trigger="interval", minutes=10)
scheduler.start()

# Para evitar problemas com o agendador ao encerrar o aplicativo
atexit.register(lambda: scheduler.shutdown())

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)

# Para uso com functions-framework
def main(request):
    with app.request_context(request.environ):
        response = app.full_dispatch_request()
        return response
