// Inicializa IndexedDB para cache de imagens
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

// Salva imagem no cache IndexedDB
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

// Recupera imagem do cache IndexedDB
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

// Busca imagem e a salva no cache
async function fetchAndCacheImage(url) {
    const localImageUrl = `/static/uploads/${getFilenameFromUrl(url)}`;
    const cachedImage = await getImageFromCache(localImageUrl);
    if (cachedImage) {
        return cachedImage;
    } else {
        try {
            const response = await fetch(localImageUrl);
            if (response.ok) {
                const blob = await response.blob();
                const reader = new FileReader();
                return new Promise((resolve, reject) => {
                    reader.onloadend = async () => {
                        const base64data = reader.result;
                        try {
                            await saveImageToCache(localImageUrl, base64data);
                        } catch (e) {
                            console.warn("Failed to save image to IndexedDB", e);
                        }
                        resolve(base64data);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } else {
                throw new Error('Network response was not ok');
            }
        } catch (error) {
            console.error("Fetching image from local storage failed, falling back to original URL:", error);
            const response = await fetch(`/image-proxy?url=${encodeURIComponent(url)}`);
            const blob = await response.blob();
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
                reader.onloadend = async () => {
                    const base64data = reader.result;
                    try {
                        await saveImageToCache(localImageUrl, base64data);
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
}

// Evento disparado ao carregar o DOM
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const showButtons = urlParams.get('buttons') === 'true';
    const isListView = urlParams.get('view') === 'list';

    let feedData = [];
    let currentPage = 1;
    const itemsPerPage = 30;
    let currentFilter = 'all';

    if (isListView) {
        document.body.classList.add('list-view');
        setToggleIcon('list');
    }

    console.log("Fetching feed data...");
    fetch('/feed')
        .then(response => response.json())
        .then(data => {
            console.log("Raw feed data:", data);
            if (!Array.isArray(data)) {
                throw new Error("Expected array, got non-array.");
            }
            console.log("Feed data received:", data);
            feedData = data;
            renderFilters(feedData);
            renderPagination(feedData);
            renderFeedItems(feedData, currentPage);
        })
        .catch(error => console.error('Error fetching the feed:', error));

    // Renderiza os filtros
    function renderFilters(data) {
        const filtersContainer = document.getElementById('filters');
        const allFeeds = Array.from(new Set(data.map(item => item.channel_title)));
        filtersContainer.innerHTML = '';

        const allButton = document.createElement('button');
        allButton.className = 'filter-btn';
        allButton.textContent = 'Tudo';
        allButton.addEventListener('click', () => {
            currentFilter = 'all';
            currentPage = 1;
            updateActiveFilter(allButton);
            renderPagination(feedData);
            renderFeedItems(feedData, currentPage);
        });
        filtersContainer.appendChild(allButton);

        allFeeds.forEach(feed => {
            const filterButton = document.createElement('button');
            filterButton.className = 'filter-btn';
            filterButton.textContent = feed;
            filterButton.addEventListener('click', () => {
                currentFilter = feed;
                currentPage = 1;
                updateActiveFilter(filterButton);
                const filteredData = feedData.filter(item => item.channel_title === feed);
                renderPagination(filteredData);
                renderFeedItems(filteredData, currentPage);
            });
            filtersContainer.appendChild(filterButton);
        });

        updateActiveFilter(allButton);
    }

    // Atualiza o filtro ativo
    function updateActiveFilter(activeButton) {
        const buttons = document.querySelectorAll('.filter-btn');
        buttons.forEach(button => button.classList.remove('active'));
        activeButton.classList.add('active');
    }

    // Renderiza a paginação
    function renderPagination(data) {
        const totalPages = Math.ceil(data.length / itemsPerPage);
        const paginationContainer = document.getElementById('pagination');
        paginationContainer.innerHTML = '';

        if (totalPages > 1) {
            const prevButton = document.createElement('button');
            prevButton.className = 'page-btn arrow';
            prevButton.innerHTML = '&#9664;'; // Seta para a esquerda
            prevButton.disabled = currentPage === 1;
            prevButton.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderFeedItems(data, currentPage);
                    renderPagination(data);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
            paginationContainer.appendChild(prevButton);

            for (let i = 1; i <= totalPages; i++) {
                const pageButton = document.createElement('button');
                pageButton.className = 'page-btn';
                pageButton.textContent = i;
                if (i === currentPage) {
                    pageButton.classList.add('active');
                }
                pageButton.addEventListener('click', () => {
                    currentPage = i;
                    renderFeedItems(data, currentPage);
                    renderPagination(data);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
                paginationContainer.appendChild(pageButton);
            }

            const nextButton = document.createElement('button');
            nextButton.className = 'page-btn arrow';
            nextButton.innerHTML = '&#9654;'; // Seta para a direita
            nextButton.disabled = currentPage === totalPages;
            nextButton.addEventListener('click', () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    renderFeedItems(data, currentPage);
                    renderPagination(data);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
            paginationContainer.appendChild(nextButton);
        }
    }

    // Renderiza os itens do feed
    function renderFeedItems(data, page) {
        const feedContainer = document.getElementById('feed');
        feedContainer.innerHTML = '';

        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, data.length);
        const pageData = data.slice(startIndex, endIndex);

        pageData.forEach(async (item) => {
            const feedItem = document.createElement('a');
            feedItem.classList.add('feed-item');
            feedItem.href = item.link;
            feedItem.target = '_blank';

            const content = document.createElement('div');
            content.classList.add('content');

            if (item.image_url) {
                const imgElement = document.createElement('img');
                imgElement.crossOrigin = 'anonymous';

                const localImageUrl = `/static/uploads/${getFilenameFromUrl(item.image_url)}`;
                imgElement.src = localImageUrl;

                imgElement.onerror = async () => {
                    const cachedImage = await fetchAndCacheImage(item.image_url);
                    imgElement.src = cachedImage;
                };

                feedItem.appendChild(imgElement);
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
                    const fullUrl = `${window.location.origin}/card/${item.id}`;
                    copyImageAndURLToClipboard(feedItem, copyBtn, fullUrl, item.title).finally(hideLoading);
                });
                buttonContainer.appendChild(copyBtn);

                footer.insertBefore(buttonContainer, footer.firstChild);
            }

            feedItem.appendChild(footer);

            feedContainer.appendChild(feedItem);
        });
    }

    function getFilenameFromUrl(url) {
        return url.substring(url.lastIndexOf('/') + 1);
    }

    // Alterna entre modos de visualização
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

    // Botão de voltar ao topo
    const backToTopBtn = document.getElementById('backToTopBtn');
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Mostra/esconde o botão de voltar ao topo com base no scroll
    window.addEventListener('scroll', () => {
        if (window.scrollY > 200) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    });

    // Define o ícone de alternância de visualização
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

// Retorna uma cor para a categoria
function getCategoryColor(index) {
    const colors = ['#007bb5', '#f39c12', '#e74c3c', '#2ecc71', '#9b59b6'];
    return colors[index % colors.length];
}

// Formata a data para o padrão brasileiro
function formatDateToBrazil(pubDate) {
    const date = new Date(pubDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Mostra o overlay de carregamento
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('show');
}

// Esconde o overlay de carregamento
function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

// Baixa o card como imagem e copia a URL
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

// Copia a imagem e a URL para a área de transferência
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
