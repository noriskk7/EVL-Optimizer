# ⚡ EVL Optimizer

🌐 [English](README.md) · **Português**

Tudo o que seu PC com Windows 10/11 precisa, num lugar só. Libere memória que continua livre, limpe lixo, desinstale apps de verdade, tire o excesso e meça o resultado. 🚀
Portátil, um único `.exe`, em Português, English e Español.

> 💸 **100% gratuito.** Se você pagou, foi enganado. Site oficial: [evlcorp.lol](https://evlcorp.lol)
> 🔓 **Código aberto e auditável.** Licença própria: grátis para uso pessoal e pequenas empresas. Sem telemetria e sem chamadas de rede.

## ✨ O que ele faz
- 🧠 **Memória**: libera RAM só de apps parados (nunca o app em foco, jogos, áudio ou VMs) e mede o resultado de novo 8 segundos depois.
- 🧹 **Limpeza**: 30 categorias de temporários, caches e restos do Windows. Cookies, senhas e arquivos pessoais ficam intocados.
- 🗑️ **Desinstalador**: remove o app e caça os restos, com backup `.reg` de cada chave apagada.
- 🎈 **Apps inúteis**: remove os apps desnecessários do Windows, nunca a Store nem a Segurança do Windows.
- 📊 **Benchmark**: CPU, RAM, disco e GPU, com nota e veredito.
- 🎮 **Modo Jogo**: percebe quando um jogo abre, prepara o PC e desfaz tudo quando ele fecha.
- ⚙️ **Ajustes, inicialização e processos**: ajustes reversíveis, gerenciador de inicialização e lista de processos ao vivo.
- 🔑 **Licença do Windows**: mostra só os 5 últimos caracteres da chave.
- 📝 **Registro de atividades**: cada ação é registrada com prova (ele mede de novo depois de agir).
- 🎨 **Aparência personalizável**: escolha a cor de destaque e o fundo.

## 🔒 Por que o código é aberto
Transparência. O app pede **administrador**, mexe no registro, remove apps e apaga arquivos, então você deve poder ler exatamente o que ele faz. Ele **não tem telemetria nem faz chamadas de rede**. O único link é um botão que abre o evlcorp.lol no navegador.

## 🗂️ Estrutura
| Caminho | O que é |
| --- | --- |
| `src/main.js` | Processo principal: janela, bandeja, monitor, Modo Jogo e handlers IPC (cada ação é registrada). |
| `src/core/` | Tudo que fala com o Windows (koffi, registro, limpeza, desinstalador, ajustes...). |
| `src/renderer/` | A interface (JavaScript puro, sem framework nem bundler). |

## 👩‍💻 Desenvolvimento
```powershell
npm install
npm start
```
O npm 11 bloqueia scripts de instalação por padrão. Se faltar `node_modules\electron\dist` depois do `npm install`, rode uma vez `node node_modules\electron\install.js`.
Sem administrador, as telas que precisam de elevação ficam desativadas.

## 📦 Compilar
```powershell
npm run dist   # exe portátil em dist\
```
Se o build não conseguir limpar `dist\` porque outro programa segura o `app.asar`, gere numa pasta fora do projeto:
`npx electron-builder --win portable --x64 "-c.directories.output=<outra pasta>"`.

🛡️ O exe não tem assinatura digital, então o SmartScreen e alguns antivírus podem avisar. Compare o SHA-256 do arquivo baixado com o publicado no release.

## 📄 Licença
[EVL Software License 1.0](LICENSE): grátis para uso pessoal e pequenas empresas (até 100 pessoas). Terceiros: Electron (MIT), koffi (MIT) e fonte Inter (OFL-1.1).

💼 **Grandes empresas e white label:** peça uma licença comercial em support@evlcorp.lol.
