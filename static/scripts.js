// Inicializa IndexedDB
let db;
const request = indexedDB.open('ImageCache', 1);
request.onupgradeneeded = function(event) {
    db = event.target.result;
    db.createObjectStore('images', { keyPath: 'url' });
};
request.onsuccess = function(event) {
    db = event.target.result;
};
request.onerror = function(event) {
    console.error('IndexedDB error:', event.target.errorCode);
};

function saveImageToCache(url, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        store.put({ url, data });
        transaction.oncomplete = function() {
            resolve();
        };
        transaction.onerror = function(event) {
            reject(event.target.error);
        };
    });
}

function getImageFromCache(url) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['images'], 'readonly');
        const store = transaction.objectStore('images');
        const request = store.get(url);
        request.onsuccess = function(event) {
            resolve(event.target.result ? event.target.result.data : null);
        };
        request.onerror = function(event) {
            reject(event.target.error);
        };
    });
}

async function fetchAndCacheImage(url) {
    const cachedImage = await getImageFromCache(url);
    if (cachedImage) {
        return cachedImage;
    } else {
        const response = await fetch(`/image-proxy?url=${encodeURIComponent(url)}`);
        const blob = await response.blob();
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onloadend = async () => {
                const base64data = reader.result;
                try {
                    await saveImageToCache(url, base64data);
                } catch (e) {
                    console.warn("Failed to save image to IndexedDB", e);
                }
                resolve(base64data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const showButtons = urlParams.get('buttons') === 'true';
    const isListView = urlParams.get('view') === 'list';

    let feedData = [];
    let currentFilter = 'all';

    if (isListView) {
        document.body.classList.add('list-view');
        setToggleIcon('list');
    }

    console.log("Fetching feed data...");
    fetch('/feed')
        .then(response => response.json())
        .then(data => {
            console.log("Feed data received:", data);
            feedData = data;
            renderFilters(data);
            renderFeedItems(data);
        })
        .catch(error => console.error('Error fetching the feed:', error));

    function renderFilters(data) {
        const filtersContainer = document.getElementById('filters');
        const allFeeds = Array.from(new Set(data.map(item => item.channel_title)));
        filtersContainer.innerHTML = '';

        const allButton = document.createElement('button');
        allButton.className = 'filter-btn';
        allButton.textContent = 'Tudo';
        allButton.addEventListener('click', () => {
            currentFilter = 'all';
            updateActiveFilter(allButton);
            renderFeedItems(feedData);
        });
        filtersContainer.appendChild(allButton);

        allFeeds.forEach(feed => {
            const filterButton = document.createElement('button');
            filterButton.className = 'filter-btn';
            filterButton.textContent = feed;
            filterButton.addEventListener('click', () => {
                currentFilter = feed;
                updateActiveFilter(filterButton);
                renderFeedItems(feedData.filter(item => item.channel_title === feed));
            });
            filtersContainer.appendChild(filterButton);
        });

        updateActiveFilter(allButton);
    }

    function updateActiveFilter(activeButton) {
        const buttons = document.querySelectorAll('.filter-btn');
        buttons.forEach(button => button.classList.remove('active'));
        activeButton.classList.add('active');
    }

    function renderFeedItems(data) {
        const feedContainer = document.getElementById('feed');
        feedContainer.innerHTML = '';

        data.forEach(async (item) => {
            const feedItem = document.createElement('a');
            feedItem.classList.add('feed-item');
            feedItem.href = item.link;
            feedItem.target = '_blank';

            const content = document.createElement('div');
            content.classList.add('content');

            if (item.image_url) {
                const imgElement = document.createElement('img');
                imgElement.crossOrigin = 'anonymous';

                const cachedImage = await fetchAndCacheImage(item.image_url);
                imgElement.src = cachedImage;

                feedItem.appendChild(imgElement);
            }

            if (item.categories && item.categories.length > 0) {
                const categoriesContainer = document.createElement('div');
                categoriesContainer.className = 'categories';
                item.categories.forEach((category, index) => {
                    const categoryTag = document.createElement('div');
                    categoryTag.className = 'category-tag';
                    categoryTag.textContent = category;
                    categoryTag.style.backgroundColor = getCategoryColor(index);  // Atribui cor diferente
                    categoriesContainer.appendChild(categoryTag);
                });
                content.appendChild(categoriesContainer);
            }

            const titleElement = document.createElement('h2');
            titleElement.textContent = item.title;
            content.appendChild(titleElement);

            const channelTitleElement = document.createElement('p');
            channelTitleElement.classList.add('channel-title');
            channelTitleElement.innerHTML = `por <b>${item.channel_title}</b>`;
            content.appendChild(channelTitleElement);

            const pubDateElement = document.createElement('p');
            pubDateElement.classList.add('pubdate');
            pubDateElement.textContent = formatDateToBrazil(item.pub_date);
            content.appendChild(pubDateElement);

            if (item.is_personal_feed) {
                const adTag = document.createElement('div');
                adTag.className = 'ad-tag';
                adTag.textContent = 'AD';
                feedItem.appendChild(adTag);
            }

            feedItem.appendChild(content);

            const footer = document.createElement('div');
            footer.classList.add('footer');
            if (showButtons) {
                footer.classList.add('show');
            }
            footer.innerHTML = 'infinitoaocubo';
            
            const brandContainer = document.createElement('div');
            brandContainer.classList.add('brand');
            const brandImage = document.createElement('img');
            brandImage.src = 'https://infinitoaocubo.com.br/img/infinito3.png';
            brandContainer.appendChild(brandImage);
            footer.appendChild(brandContainer);

            if (showButtons) {
                const buttonContainer = document.createElement('div');
                buttonContainer.classList.add('button-container');

                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = 'Baixar';
                downloadBtn.addEventListener('click', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    showLoading();
                    downloadCardAsImageAndCopyURL(feedItem, downloadBtn, item.link, item.title).finally(hideLoading);
                });
                buttonContainer.appendChild(downloadBtn);

                const copyBtn = document.createElement('button');
                copyBtn.textContent = 'Copiar';
                copyBtn.addEventListener('click', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    showLoading();
                    copyImageAndURLToClipboard(feedItem, copyBtn, item.link, item.title).finally(hideLoading);
                });
                buttonContainer.appendChild(copyBtn);

                footer.insertBefore(buttonContainer, footer.firstChild);
            }

            feedItem.appendChild(footer);

            feedContainer.appendChild(feedItem);
        });
    }

    const toggleViewBtn = document.getElementById('toggleViewBtn');
    toggleViewBtn.addEventListener('click', () => {
        document.body.classList.toggle('list-view');
        if (document.body.classList.contains('list-view')) {
            history.pushState(null, '', '?view=list');
            setToggleIcon('list');
        } else {
            history.pushState(null, '', '?view=cards');
            setToggleIcon('cards');
        }
    });

    const backToTopBtn = document.getElementById('backToTopBtn');
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', () => {
        if (window.scrollY > 200) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    });

    function setToggleIcon(view) {
        const toggleIcon = document.getElementById('toggleIcon');
        if (view === 'list') {
            toggleIcon.innerHTML = `
                <rect x="3" y="3" width="7" height="7" fill="#FFFFFF"/>
                <rect x="14" y="3" width="7" height="7" fill="#FFFFFF"/>
                <rect x="3" y="14" width="7" height="7" fill="#FFFFFF"/>
                <rect x="14" y="14" width="7" height="7" fill="#FFFFFF"/>
            `;
        } else {
            toggleIcon.innerHTML = `
                <rect x="3" y="5" width="18" height="2" fill="#FFFFFF"/>
                <rect x="3" y="11" width="18" height="2" fill="#FFFFFF"/>
                <rect x="3" y="17" width="18" height="2" fill="#FFFFFF"/>
            `;
        }
    }
});

function getCategoryColor(index) {
    const colors = ['#007bb5', '#f39c12', '#e74c3c', '#2ecc71', '#9b59b6'];
    return colors[index % colors.length];
}

function formatDateToBrazil(pubDate) {
    const date = new Date(pubDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function showLoading() {
    document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

async function downloadCardAsImageAndCopyURL(card, button, url, title) {
    const buttons = card.querySelector('.button-container');
    buttons.style.display = 'none';

    try {
        const canvas = await html2canvas(card, { useCORS: true });

        const link = document.createElement('a');
        link.download = 'card.png';
        link.href = canvas.toDataURL('image/png');
        link.click();

        await navigator.clipboard.writeText(`${title}: ${url}`);
        alert('Imagem baixada e URL copiada para a área de transferência!');
    } catch (err) {
        console.error('Erro ao baixar imagem e copiar URL: ', err);
    } finally {
        buttons.style.display = 'flex';
    }
}

async function copyImageAndURLToClipboard(card, button, url, title) {
    const buttons = card.querySelector('.button-container');
    buttons.style.display = 'none';

    try {
        const canvas = await html2canvas(card, { useCORS: true });

        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        const clipboardItems = [
            new ClipboardItem({
                [blob.type]: blob,
                'text/plain': new Blob([`${title}: ${url}`], { type: 'text/plain' })
            })
        ];

        await navigator.clipboard.write(clipboardItems);
        alert('Imagem e URL copiadas para a área de transferência!');
    } catch (err) {
        console.error('Erro ao copiar imagem e URL: ', err);
    } finally {
        buttons.style.display = 'flex';
    }
}


async function copyImageAndURLToClipboard(card, button, url, title) {
    const buttons = card.querySelector('.button-container');
    buttons.style.display = 'none';

    try {
        const canvas = await html2canvas(card, { useCORS: true });

        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        const clipboardItems = [
            new ClipboardItem({
                [blob.type]: blob,
                'text/plain': new Blob([`${title}: ${url}`], { type: 'text/plain' })
            })
        ];

        await navigator.clipboard.write(clipboardItems);
        alert('Imagem e URL copiadas para a área de transferência!');
    } catch (err) {
        console.error('Erro ao copiar imagem e URL: ', err);
    } finally {
        buttons.style.display = 'flex';
    }
}
