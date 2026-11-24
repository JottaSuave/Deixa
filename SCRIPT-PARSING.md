# Roteiros, perfis e importação

## Separação de responsabilidades

- `script-data.js` contém o texto de referência já revisado do baralho atual. Ele não deve guardar regras gerais do parser.
- `script-parser-profiles.js` reúne convenções reutilizáveis de roteiros teatrais: cabeçalhos, aliases de personagens, marcas de rubrica e sinais de layout do PDF.
- `script-parser.js` aplica um perfil ao texto extraído e devolve cenas, personagens e blocos no formato do app.
- `pdf-import.js` extrai texto do PDF. Não decide quem fala nem altera o conteúdo do roteiro.
- `index.html` cria um novo baralho, guarda a origem e a versão do perfil, e abre a revisão antes do jogo.

## Formato do baralho

Os baralhos usam `schemaVersion: 1` e esta estrutura principal:

```js
{
  id,
  title,
  source: { kind, filename, importedAt },
  parser: { engine, engineVersion, profileId, profileVersion },
  characters: [],
  scenes: [{
    number,
    title,
    lines: [{ type: 'dialogue' | 'rubric', speaker, text, page, column }]
  }]
}
```

`page`, `column`, `layoutY` e, quando necessário, `simultaneousGroup` preservam contexto útil do documento. `layoutY` é uma posição vertical relativa à página, usada quando o texto precisa ser reconstruído visualmente; a ordem das falas deve acompanhar primeiro a página e depois a altura, mantendo cada coluna registrada. Baralhos antigos recebem valores padrão ao serem carregados.

## Convenções reaproveitadas do Dramaturgia LAB 08

O perfil `pt-br-theatre-v1` registra padrões, não o elenco obrigatório do próximo texto:

- reconhecer listas `PERSONAGENS`/`ELENCO` e preferir o nome completo mais longo;
- aceitar nome em linha própria, seguido de travessão ou de dois-pontos;
- reparar nomes compostos quebrados entre linhas do PDF somente quando a forma completa aparece no elenco;
- aceitar `PUXADOR` como forma curta de `PUXADOR DE SAMBA`;
- manter nomes compostos como `ALGUÉM QUE IA PASSANDO` como uma identidade única quando aparecem no elenco;
- carregar continuação sem novo rótulo com o personagem atual, mas reiniciar o contexto ao detectar rubrica;
- reconhecer marcações de rubrica e ações frequentes;
- preservar quebras de página, colunas e cenas em formato de retrato-falado;
- em cenas de retrato-falado, atribuir declarações sem rubrica de personagem à voz coletiva `O POVO`, preservando a coluna; uma pessoa citada dentro de uma fala não deve ser inferida como quem fala.

Os exemplos de nomes servem para documentar os problemas de diagramação já encontrados. O parser só trata um nome como personagem quando ele é reconhecido no roteiro importado ou por uma regra de alias explícita.

## Fluxo para um novo texto

1. Importar o PDF. O conteúdo é extraído e processado pelo perfil teatral padrão.
2. O app cria um baralho novo, com identificador e origem próprios; o texto de referência atual não é sobrescrito.
3. Conferir elenco, atribuição, cenas e continuidade na tela **Revisão do roteiro**.
4. Se o novo documento usar outra convenção de diagramação, criar um perfil versionado em `script-parser-profiles.js` e apontar o importador para ele. Não acrescentar nomes ou exceções de uma obra específica ao motor geral.
5. Manter correções de texto específicas no baralho daquela obra. Só promover uma regra ao perfil quando ela representar um padrão reutilizável.

Para chamar o parser diretamente, use `window.parseScriptText(texto, { profileId: 'pt-br-theatre-v1' })`. O resultado inclui os metadados do motor e do perfil usados.
