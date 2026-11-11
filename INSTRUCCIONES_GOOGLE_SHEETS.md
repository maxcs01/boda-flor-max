# INSTRUÇÕES DE ATUALIZAÇÃO NO GOOGLE SHEETS
## Boda Flor & Max — Versão 5.0 (Correção de E-mail + Pase QR + Portaria)

Planilha oficial: 👉 [Abrir Google Sheets](https://docs.google.com/spreadsheets/d/15U2O1gAzXvVkAWobayX6wO_MYeyNyJu3WC-Elx4Xn4U/edit?gid=0#gid=0)

---

### 📌 Novidades da Versão 5.0:
1. **Correção do Disparo Automático de E-mail**: Agora o e-mail de confirmação inclui a **imagem do Código QR embutida** + botão direto para o Pase Digital Online.
2. **Pase Digital com QR Code para Cada Confirmação**:
   - Cada convidado confirmado (e seu grupo de acompanhantes) recebe um código único na **Coluna K (`ID Pase QR`)** e o link na **Coluna L (`Link del Pase`)**.
   - Ao confirmar pelo site, o QR Code também aparece na tela na hora (com botão de **baixar imagem PNG**) e vai em formato de link na mensagem automática do WhatsApp.
3. **Sistema de Portaria para o Dia da Festa (`recepcion.html`)**:
   - Acesse `https://bodaflor-max.netlify.app/recepcion.html` no celular da entrada.
   - **PIN padrão de acesso da portaria:** `2103` *(pode ser alterado na linha `var RECEPTION_PIN` dentro do `google-apps-script.js`)*.
   - Ao ler o QR Code do convidado, mostra o **Nome e Sobrenome do titular**, todos os **Acompanhantes** (se houver) e registra o horário exato de entrada na **Coluna M (`Ingreso / Check-in`)**.

---

### 🔄 Passo 1: Atualizar o Código no Google Sheets (OBRIGATÓRIO)
1. Abra a sua planilha no Google Sheets e vá no menu **Extensões** > **Apps Script**.
2. Apague todo o código antigo da aba `Código.gs`.
3. Copie todo o conteúdo do arquivo [`google-apps-script.js`](file:///C:/Users/Windows/.gemini/antigravity/scratch/boda-flor-y-max/google-apps-script.js) e cole lá.
4. Clique no ícone de **Salvar (Disquete)** 💾.

---

### ✉️ Passo 2: Autorizar e Testar o Envio de E-mail (CORRIGE O DISPARO!)
> **Por que o e-mail não estava saindo antes?** O Google exige que o dono da planilha execute uma função manualmente pelo menos 1 vez após adicionar envio de e-mail (`MailApp`) para aprovar a janela de permissão.

1. No próprio editor do **Apps Script**, na barra superior onde está selecionado o nome da função, escolha **`autorizarYProbarEmail`**.
2. Clique em **Executar (Play)** ▶️.
3. O Google abrirá uma janela dizendo *"Autorização necessária"* (ou *"O Google não verificou este app"*):
   - Clique em **Revisar permissões** > escolha sua conta Google.
   - Clique em **Avançado (Advanced)** > **Acessar projeto (não seguro)** > **Permitir (Allow)**.
4. Em poucos segundos, chegará um **e-mail de teste com QR Code** na sua própria caixa de entrada do Gmail!

---

### 🌐 Passo 3: Publicar a Nova Versão do Web App
1. Ainda no **Apps Script**, no canto superior direito, clique em **Implantar (Deploy)** > **Gerenciar implantações (Manage deployments)**.
2. Clique no ícone do **Lápis (Editar)** ✏️.
3. No campo **Versão (Version)**, selecione **"Nova versão" (New version)**.
4. Clique em **Implantar (Deploy)** e aguarde concluir. *(A URL do script continua exatamente a mesma — não precisa mudar nada no site!)*.

---

### 🎫 Passo 4: Gerar QRs para Quem Já Confirmou Antes
1. Volte para a aba da sua planilha no Google Sheets e **recarregue a página (F5)**.
2. Aparecerá um novo menu no topo chamado **`💌 Boda Flor & Max`**.
3. Clique em **`💌 Boda Flor & Max`** > **`🎫 Generar QRs para Confirmados Existentes`**.
4. Todas as confirmações antigas ganharão automaticamente seu código na Coluna K e o link na Coluna L (que você pode copiar e enviar pelo WhatsApp se desejar!).

---

### 🔤 Passo 5: Atualizar a Aba `Lista Alfabética` (Colunas A até M)
Se você já criou a aba espelho **`Lista Alfabética`** que ordena os titulares de A a Z com os acompanhantes logo abaixo, atualize a fórmula da célula **`A1`** para incluir as novas colunas `K`, `L` e `M`:

```excel
=LET(
  dados; FILTER('Hoja 1'!A2:M; 'Hoja 1'!A2:A<>"");
  nomes; CHOOSECOLS(dados; 1);
  posOriginal; SEQUENCE(ROWS(dados));
  grupoTitular; SCAN(""; nomes; LAMBDA(prev; curr; IF(ISNUMBER(SEARCH("↳"; curr)); prev; curr)));
  tabelaCompleta; HSTACK(grupoTitular; posOriginal; dados);
  tabelaOrdenada; SORT(tabelaCompleta; 1; VERDADERO; 2; VERDADERO);
  resultado; CHOOSECOLS(tabelaOrdenada; SEQUENCE(COLUMNS(dados); 1; 3));
  VSTACK('Hoja 1'!A1:M1; resultado)
)
```
*(Se a sua planilha usar vírgula em vez de ponto e vírgula, troque `;` por `,` e `VERDADERO` por `TRUE`. Se a aba original tiver outro nome, substitua `'Hoja 1'` pelo nome exato da aba).*

---

### 🎨 Manter os Titulares em Negrito `#4a5d4e` na `Lista Alfabética`
1. Na aba **`Lista Alfabética`**, selecione a coluna **A** a partir da linha 2 (`A2:A`).
2. Vá em **Formatar** > **Formatação condicional**.
3. Use **"A fórmula personalizada é"**:
   ```excel
   =AND(A2<>""; NOT(ISNUMBER(SEARCH("↳"; A2))))
   ```
4. Ative **Negrito (B)** e cor do texto **`#4a5d4e`**.
