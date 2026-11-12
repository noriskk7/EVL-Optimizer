# ⚡ EVL Optimizer

🌐 [English](README.md) · **Português**

Tudo o que seu PC com Windows 10/11 precisa, num lugar só. 🚀
Libere memória que continua livre, limpe lixo, desinstale apps de verdade, tire o excesso e meça o resultado.

Portátil, um único `.exe`, em Português, English e Español.

> 💸 **100% gratuito.** Se você pagou, foi enganado. Site oficial: [evlcorp.lol](https://evlcorp.lol)
>
> 🔓 **Código aberto e auditável.** Licença própria: grátis para uso pessoal e pequenas empresas.
>
> 🔒 Sem telemetria. A única requisição de rede é uma verificação de atualização opcional, uma vez por dia (veja [Atualizações](#-atualizações)).

---

## ✨ O que ele faz

### 🧹 Limpeza (35 categorias)

- 💻 **Windows:** temporários, miniaturas, cache da Store e do WebView2, relatórios de erro, restos do Windows Update, shader cache
- 🎵 **DAWs:** Ableton, FL Studio, Cubase, Pro Tools, Studio One, REAPER, Bitwig, Reason e outros. Cache, logs e **cache de varredura de plugins VST**
- 🔌 **Plugins:** Native Instruments, Waves, iZotope, Arturia, Splice e outros gerenciadores de plugins
- 🎨 **Criação e streaming:** Adobe (todos os apps), DaVinci Resolve, Blender, Unity, OBS, Streamlabs, Elgato
- 🌐 **Navegadores e apps:** Chrome, Edge, Firefox, Discord, Signal, Zoom, Notion, Figma, Spotify, Deezer, TIDAL e muitos outros
- 🎮 **Jogos:** Steam, Epic, Battle.net, Riot, FiveM, Minecraft
- 🖱️ **Apps de hardware:** NVIDIA, Razer, Logitech, Corsair, SteelSeries, ASUS, MSI, Overwolf
- 🔒 **Nunca tocados:** projetos, backups, recuperação de sessão, bibliotecas, samples, presets, licenças, cookies e senhas
- ⏸️ **Seguro por construção:** app aberto é pulado

### 🗑️ Desinstalador

- 🔍 Remove o app e caça os restos: pastas, registro, atalhos, serviços e tarefas
- 🎹 Acha também plugins VST, VST3, CLAP e AAX, drivers ASIO e regras do Firewall
- ⚠️ Avisa se o app ainda está aberto (nunca fecha por você)
- 🛡️ Nada dentro de Documentos vem marcado por padrão
- 💾 Cada chave de registro ganha um backup `.reg`, e as pastas vão para a Lixeira

### 🎈 Apps inúteis

- 🧼 Remove os apps desnecessários do Windows, nunca a Store nem a Segurança do Windows
- 🔑 Apaga as chaves de registro que o Windows usa para trazê-los de volta (com backup `.reg`)
- ⚙️ Desativa os serviços que só esses apps usam (reversível)

### 🧠 Mais ferramentas

- 🧠 **Memória:** libera RAM só de apps parados (nunca o app em foco, jogos, áudio ou VMs) e mede o resultado de novo 8 segundos depois
- 🎮 **Modo Jogo:** percebe quando um jogo abre, prepara o PC e desfaz tudo quando ele fecha
- 📊 **Benchmark:** CPU, RAM, disco e GPU, com nota e veredito
- ⚙️ **Ajustes, inicialização e processos:** ajustes reversíveis, gerenciador de inicialização e lista de processos ao vivo
- 🔑 **Licença do Windows:** mostra só os 5 últimos caracteres da chave
- 📝 **Registro de atividades:** cada ação é registrada com prova (ele mede de novo depois de agir)
- 🎨 **Aparência personalizável:** escolha a cor de destaque e o fundo

---

## 🔒 Por que o código é aberto

Transparência. O app pede **administrador**, mexe no registro, remove apps e apaga arquivos, então você deve poder ler exatamente o que ele faz.

Ele **não tem telemetria**. A única requisição de rede é a verificação de atualização opcional, e os links abrem o [evlcorp.lol](https://evlcorp.lol) no navegador.

## 🔄 Atualizações

- 📅 Uma vez por dia, o app pergunta ao GitHub qual é a versão mais recente e mostra um aviso na tela Início se houver uma nova
- 🔒 Nenhum dado é enviado, e **nada é baixado nem instalado sozinho**: o aviso abre a página de download no [evlcorp.lol](https://evlcorp.lol)
- ⚙️ Desligue em **Configurações → Avisar sobre novas versões**

## 🗂️ Estrutura

| Caminho | O que é |
| --- | --- |
| `src/main.js` | Processo principal: janela, bandeja, monitor, Modo Jogo e handlers IPC (cada ação é registrada) |
| `src/core/` | Tudo que fala com o Windows (koffi, registro, limpeza, desinstalador, ajustes...) |
| `src/renderer/` | A interface (JavaScript puro, sem framework nem bundler) |

## 👩‍💻 Desenvolvimento

```powershell
npm install
npm start
```

- O npm 11 bloqueia scripts de instalação por padrão. Se faltar `node_modules\electron\dist` depois do `npm install`, rode uma vez `node node_modules\electron\install.js`
- Sem administrador, as telas que precisam de elevação ficam desativadas

## 📦 Compilar

```powershell
npm run dist   # exe portátil em dist\
```

Se o build não conseguir limpar `dist\` porque outro programa segura o `app.asar`, gere numa pasta fora do projeto:
`npx electron-builder --win portable --x64 "-c.directories.output=<outra pasta>"`.

🛡️ O exe não tem assinatura digital, então o SmartScreen e alguns antivírus podem avisar. Compare o SHA-256 do arquivo baixado com o publicado no release.

## 🤝 Contribuindo

Pull requests são bem-vindos! Correções, traduções e melhorias são todas apreciadas.

Ao enviar uma contribuição, você aceita os termos de contribuição da seção 4 da [licença](LICENSE): você concede à EvlCorp uma licença para usá-la no Software.

## 📄 Licença

[EVL Software License 1.0](LICENSE): grátis para uso pessoal e pequenas empresas (até 100 pessoas).

Terceiros: Electron (MIT), koffi (MIT) e fonte Inter (OFL-1.1).

💼 **Grandes empresas e white label:** peça uma licença comercial em support@evlcorp.lol.
