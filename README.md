# The Rise of Freny (web)

Build WebGL do jogo, publicada na Vercel como site estático.

- `index.html`, `Build/` e `TemplateData/` saem direto da build WebGL do Unity (compressão Gzip).
- `vercel.json` manda os headers `Content-Encoding: gzip` para os arquivos `.gz` da pasta `Build/`.

Para atualizar: gerar uma nova build WebGL, substituir `index.html`, `Build/` e `TemplateData/` e dar push no `master`.

## Devlog

A aba Devlog (`#devlog`) lê o `devlog.json`. A cada atualização, adicione uma entrada no topo de `versoes`
com `versao`, `data` (AAAA-MM-DD), `hora` (HH:MM, horário de Brasília), `titulo` e a lista `mudancas`.
O que já está pronto mas ainda não subiu fica numa entrada com `"proxima": true`; na hora do deploy ela vira a versão nova.
