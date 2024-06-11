# InfinitoAoCubo News - RSS Feed

## Descrição
O projeto InfinitoAoCubo News é uma aplicação web desenvolvida com Flask que gerencia e exibe feeds RSS. Ele permite que os usuários visualizem os últimos conteúdos de diferentes fontes RSS em um formato organizado e acessível.

## Funcionalidades
- Coleta e exibição de feeds RSS
- Atualização automática dos feeds a cada 10 minutos
- Interface responsiva para uma experiência de usuário agradável
- Opção de visualizar os feeds em diferentes formatos (cards, lista)
- Compartilhamento fácil via WhatsApp

## Estrutura do Projeto
- **main.py**: Arquivo principal da aplicação Flask.
- **Dockerfile**: Para a containerização da aplicação.
- **docker-compose.yml**: Configuração para orquestrar múltiplos contêineres.
- **requirements.txt**: Lista de dependências Python necessárias para rodar a aplicação.
- **personal_feed**: Diretório com feeds RSS personalizados.
- **static**: Arquivos estáticos (CSS, JS, imagens).
- **templates**: Templates HTML da aplicação.

## Tecnologias Utilizadas
- Flask
- Docker
- Redis
- HTML/CSS/JavaScript

## Instalação e Configuração
1. Clone o repositório:
    ```bash
    git clone https://github.com/olucasmac/news.infinitoaocubo.com.br.git
    cd news.infinitoaocubo.com.br
    ```
2. Construa e inicie os contêineres Docker:
    ```bash
    docker-compose up --build
    ```
3. Acesse a aplicação em seu navegador:
    ```plaintext
    http://localhost:5000
    ```

## Contribuição
Se você deseja contribuir com o projeto, sinta-se à vontade para abrir issues e enviar pull requests. Sua ajuda será muito apreciada!

## Licença
Este projeto está licenciado sob a Licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## Contato
Para dúvidas e sugestões, entre em contato através do [GitHub Issues](https://github.com/olucasmac/news.infinitoaocubo.com.br/issues).

