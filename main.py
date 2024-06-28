from flask import Flask, render_template, jsonify, request, send_file, send_from_directory
from flask_caching import Cache
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from apscheduler.schedulers.background import BackgroundScheduler
import requests
from xml.etree import ElementTree as ET
from io import BytesIO
import re
from datetime import datetime, timezone, timedelta
import os
import atexit

app = Flask(__name__)

# Definir URL da imagem genérica
GENERIC_IMAGE_URL = 'https://news.infinitoaocubo.com.br/static/imgs/no-image.png'  # Substitua pelo URL da sua imagem genérica

# Configuração do cache
app.config['CACHE_TYPE'] = 'redis'
app.config['CACHE_REDIS_HOST'] = os.environ.get('REDIS_HOST', 'localhost')
app.config['CACHE_REDIS_PORT'] = os.environ.get('REDIS_PORT', 6379)
app.config['CACHE_REDIS_DB'] = os.environ.get('CACHE_REDIS_DB', 0)
app.config['CACHE_REDIS_URL'] = os.environ.get('CACHE_REDIS_URL', f'redis://{app.config["CACHE_REDIS_HOST"]}:{app.config["CACHE_REDIS_PORT"]}/{app.config["CACHE_REDIS_DB"]}')
cache = Cache(app)

# Configuração do banco de dados
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'postgresql://user:password@localhost:5432/feeds_db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
migrate = Migrate(app, db)

# URL base do aplicativo
BASE_URL = os.environ.get('BASE_URL', 'http://localhost:5000/')

class FeedItem(db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
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
        local_timezone = timezone(timedelta(hours=-3))  # Ajuste o deslocamento conforme necessário
        local_pub_date = self.pub_date.astimezone(local_timezone)
        return {
            'id': self.id,
            'title': self.title,
            'link': self.link,
            'pub_date': local_pub_date.isoformat(),
            'image_url': self.image_url,
            'channel_title': self.channel_title,
            'is_personal_feed': self.is_personal_feed,
            'categories': self.categories
        }

def extract_image_from_description(description):
    match = re.search(r'<img[^>]+src="([^">]+)"', description)
    return match.group(1) if match else ''

def parse_pub_date(pub_date):
    formats = [
        '%a, %d %b %Y %H:%M:%S %z',
        '%Y-%m-%dT%H:%M:%S%z',
        '%a, %d %b %Y %H:%M:%S %Z',
        '%d %b %Y %H:%M:%S %z',
        '%d/%m/%Y %H:%M:%S'
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(pub_date, fmt)
            return dt.astimezone(timezone.utc)
        except ValueError:
            continue
    
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
        'https://pox.globo.com/rss/techtudo/',
        'https://www.legiaodosherois.com.br/rss',
        'https://feeds.jovemnerd.com.br/rss/feed',
        BASE_URL + 'personal_feed/meu_feed.xml'
    ]

    feed_items = []
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=72)

    for feed_url in feed_urls:
        response = requests.get(feed_url)
        if response.status_code != 200:
            continue
        xml = ET.fromstring(response.content)
        channel_title = xml.find('channel/title').text
        is_personal_feed = feed_url == BASE_URL + 'personal_feed/meu_feed.xml'
        items = xml.findall('channel/item')

        for item in items:
            categories = item.findall('category')
            if any(category.text.lower() == 'affiliation' for category in categories):
                continue

            title = item.find('title').text
            link = item.find('link').text
            pub_date_str = item.find('pubDate').text
            pub_date = parse_pub_date(pub_date_str)

            if pub_date < cutoff_time:
                continue

            enclosure = item.find('enclosure')
            image_url = enclosure.attrib['url'] if enclosure is not None else ''

            if not image_url:
                description = item.find('description').text
                image_url = extract_image_from_description(description)
                if not image_url:
                    image_url = GENERIC_IMAGE_URL

            image_filename = image_url.split('/')[-1]
            local_image_path = os.path.join('static', 'uploads', image_filename)
            if not os.path.exists(local_image_path):
                try:
                    img_data = requests.get(image_url).content
                    with open(local_image_path, 'wb') as handler:
                        handler.write(img_data)
                except Exception as e:
                    print(f"Failed to save image {image_url}: {e}")

            categories_text = ','.join([category.text for category in categories])

            # Verifica se já existe um item com o mesmo título e link no banco de dados
            existing_item = FeedItem.query.filter_by(title=title, link=link).first()
            if existing_item:
                feed_item = existing_item
            else:
                feed_item = FeedItem(
                    title=title,
                    link=link,
                    pub_date=pub_date,
                    image_url=image_filename,
                    channel_title=channel_title,
                    is_personal_feed=is_personal_feed,
                    categories=categories_text
                )

            db.session.add(feed_item)
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

@app.route('/noticia/<int:item_id>')
def card(item_id):
    feed_item = FeedItem.query.get_or_404(item_id)
    return render_template('card.html', item=feed_item)

@app.route('/noticias')
def noticias():
    feed_items = FeedItem.query.order_by(FeedItem.pub_date.desc()).all()
    return render_template('noticias.html', feed_items=feed_items)

scheduler = BackgroundScheduler()

def scheduled_task():
    with app.app_context():
        fetch_and_cache_feeds()

scheduler.add_job(func=scheduled_task, trigger="interval", minutes=10)
scheduler.start()

atexit.register(lambda: scheduler.shutdown())

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)

def main(request):
    with app.request_context(request.environ):
        response = app.full_dispatch_request()
        return response
