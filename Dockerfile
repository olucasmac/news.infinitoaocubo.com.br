# Usa uma imagem base do Python
FROM python:3.9-slim

# Define o diretório de trabalho no contêiner
WORKDIR /app

# Copia os requisitos do projeto para o contêiner
COPY requirements.txt requirements.txt

# Instala as dependências
RUN pip install -r requirements.txt

# Copia o código da aplicação para o contêiner
COPY . .

# Defina a variável de ambiente FLASK_APP
ENV FLASK_APP=main.py

# Exponha a porta que o Flask usará
EXPOSE 5000

# Comando para iniciar a aplicação
CMD ["flask", "run", "--host=0.0.0.0"]
