# Ryse of Freny (web)

Build WebGL do jogo, publicada na Vercel como site estático.

- `index.html`, `Build/` e `TemplateData/` saem direto da build WebGL do Unity (compressão Gzip).
- `vercel.json` manda os headers `Content-Encoding: gzip` para os arquivos `.gz` da pasta `Build/`.

Para atualizar: gerar uma nova build WebGL, substituir `index.html`, `Build/` e `TemplateData/` e dar push no `master`.
