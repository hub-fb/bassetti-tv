# Bassetti TV 📺

O **Bassetti TV** é o frontend do ecossistema IPTV Bassetti. Ele foi projetado para consumir diretamente a lista estruturada e higienizada `ListaIPTV.m3u` gerada pelo projeto de backend **Bassetti IPTV Hub**.

Construído inteiramente em HTML5, CSS3 e JavaScript puro (Vanilla), sem dependência de frameworks complexos, garantindo carregamento ultrarrápido e hospedagem estática direta no **GitHub Pages**.

## 🚀 Recursos Implementados (v1.0)
* **Consumo de API Estática**: Carregamento assíncrono via URL externa configurável.
* **Engine Modular Player**: Integração robusta via biblioteca `HLS.js`.
* **Tratamento de Dados**: Sistema inteligente de busca por texto e filtragem nativa por categorias.
* **Persistência Local**: Histórico de reprodução recente e aba de favoritos salvo nativamente no navegador (`localStorage`).
* **Interface Responsiva**: Adaptável para monitores desktop e telas móveis.

## 🛠️ Configurações Técnicas
Para modificar a fonte de dados das playlists de canais, altere a propriedade contida no arquivo local `config.js`.
