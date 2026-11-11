# 🎄 Intercambio Navideño de Pijamas Pachoncitas ($300 MXN)

Sitio web móvil interactivo para organizar el **Intercambio de Pijamas Pachoncitas** entre **12 y 13 personas**, con generación de **Token personal**, consulta de resultados para el **lunes 16 de noviembre**, recordatorios para **Google Calendar / iPhone Calendar / WhatsApp**, enlace al **video de invitación** y **script de automatización para WhatsApp de Escritorio**.

---

## 📂 1. ¿Dónde puedo ver la Base de Datos recolectada?

Tienes **3 formas directas** de ver y administrar la base de datos de tus participantes:

1. **Archivo JSON directo en tu carpeta**:
   - [`bd_intercambio.json`](./bd_intercambio.json): Guarda toda la estructura del evento, los 12-13 participantes registrados, sus tallas, su color/estampado favorito, su teléfono/correo, su Token (`PIJAMA-XXXX`) y la persona que les tocó en el sorteo.
2. **Archivo de Excel (`.csv`) automático**:
   - `bd_intercambio_pijamas.csv`: Se genera automáticamente cada vez que alguien se registra o cuando lo descargas desde el panel del sitio, listo para abrirse con doble clic en **Excel**.
3. **Panel de Organizador dentro del mismo Sitio Móvil**:
   - En la parte inferior de la página web haz clic en **`🔒 Panel de Organizador`**.
   - Ingresa el PIN por defecto: **`1225`**.
   - Ahí verás en vivo la lista de registrados, podrás presionar **`🎲 Realizar / Actualizar Sorteo Ahora`**, editar el link del video de invitación y descargar la base de datos actualizada en `.json` o `.csv`.

---

## 🌐 2. Cómo montar el sitio en una URL gratuita y confiable (GitHub Pages)

El repositorio Git ya está inicializado en esta carpeta (`c:\Users\NUXIBA\Downloads\Intercambio`). Para publicarlo gratis bajo el dominio oficial de GitHub (`https://tu-usuario.github.io/intercambio-pijamas/`):

1. Entra a [github.com/new](https://github.com/new) y crea un repositorio público llamado **`intercambio-pijamas`**.
2. En esta carpeta abre una terminal y ejecuta:
   ```bash
   git remote add origin https://github.com/TU-USUARIO/intercambio-pijamas.git
   git branch -M main
   git push -u origin main
   ```
3. En tu repositorio de GitHub ve a **Settings ➔ Pages**, en **Branch** selecciona **`main`** y da clic en **Save**.
4. En 1 minuto tendrás tu enlace limpio y seguro:
   `https://tu-usuario.github.io/intercambio-pijamas/`

*(También puedes abrir el sitio localmente en tu computadora dando doble clic en [`1_iniciar_sitio.bat`](./1_iniciar_sitio.bat) para usarlo en `http://localhost:3000`).*

---

## 💬 3. Cómo enviar los WhatsApps a todos desde tu WhatsApp Personal de Escritorio

Cuando ya estén registrados los 12-13 participantes en [`bd_intercambio.json`](./bd_intercambio.json):

1. Abre tu aplicación de **WhatsApp de Escritorio** en tu PC con Windows.
2. Da doble clic en el archivo [`2_enviar_whatsapps.bat`](./2_enviar_whatsapps.bat) (o ejecuta en terminal `python enviar_whatsapp.py`).
3. El script [`enviar_whatsapp.py`](./enviar_whatsapp.py):
   - Verificará si ya se hizo el sorteo (y si no, lo realizará automáticamente cuidando que a nadie le toque a sí mismo y lo guardará en `bd_intercambio.json`).
   - Abrirá el chat de cada participante en tu WhatsApp de Escritorio con el mensaje personalizado (quién le tocó, su talla, su color/estampado favorito, su Token, el link a la página para agendar en su calendario y el link al video de la invitación).
   - Puedes elegir **Modo Automático (Opción 1)** para que presione `Enter` solo en cada chat, o **Modo Asistido (Opción 2)** para revisar cada mensaje antes de enviarlo.
