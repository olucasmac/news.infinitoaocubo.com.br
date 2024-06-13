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
GENERIC_IMAGE_URL = 'https://raw.githubusercontent.com/olucasmac/news.infinitoaocubo.com.br/feat/add-db-and-redis/static/imgs/no-image.png'  # Substitua pelo URL da sua imagem genérica

# Dicionário de mapeamento de nomes de feeds para textos personalizados
FEED_NAME_MAPPING = {
    'GameVicio - Últimas Notícias': 'GameVicio',
    'IGN Brasil': 'IGN',
    'Novidades do TecMundo': 'TecMundo',
    'Canaltech': 'Canaltech',
    'techtudo': 'TechTudo',
    'Legião dos Heróis': 'Legião dos Heróis',
    'Jovem Nerd': 'Jovem Nerd'
}

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
    formats = [
        '%a, %d %b %Y %H:%M:%S %z',  # Formato comum usado em RSS
        '%Y-%m-%dT%H:%M:%S%z',        # Formato ISO 8601
        '%a, %d %b %Y %H:%M:%S %Z',   # Sem fuso horário
        '%d %b %Y %H:%M:%S %z',       # Sem dia da semana
        '%d/%m/%Y %H:%M:%S'           # Formato brasileiro comum
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(pub_date, fmt)
        except ValueError:
            continue
    
    # Retornar uma data padrão em caso de falha
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
        BASE_URL + 'personal_feed/meu_feed.xml'  # Usando a URL base do aplicativo
    ]

    feed_items = []
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=48)  # Define o limite de 48 horas

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
                continue  # Ignora itens que são mais antigos do que 72 horas

            enclosure = item.find('enclosure')
            image_url = enclosure.attrib['url'] if enclosure is not None else ''

            if not image_url:
                description = item.find('description').text
                image_url = extract_image_from_description(description)
                if not image_url:
                    image_url = GENERIC_IMAGE_URL  # Usa a imagem genérica se nenhuma outra imagem for encontrada

            categories_text = ','.join([category.text for category in categories])

            feed_item = FeedItem(
                title=title,
                link=link,
                pub_date=pub_date,
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

def scheduled_task():
    with app.app_context():
        fetch_and_cache_feeds()

scheduler.add_job(func=scheduled_task, trigger="interval", minutes=10)
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
