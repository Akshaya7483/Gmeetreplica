# Realtime Classroom - Live Testing Guide (Ngrok)

Follow these steps to test the application with friends over the internet using ngrok.

## 1. Prerequisites
- [ngrok](https://ngrok.com/) installed and authenticated (`ngrok config add-authtoken YOUR_TOKEN`).
- Node.js installed.

## 2. Server Setup (Terminal 1)
1. Navigate to the `server` folder.
2. Create/Update `.env`:
   ```env
   PORT=5000
   CLIENT_URL=http://localhost:5173
   ```
3. Run the server:
   ```bash
   npm run dev
   ```
4. Start ngrok for the server (Terminal 2):
   ```bash
   ngrok http 5000
   ```
5. **Copy the Forwarding URL** (e.g., `https://xxxx-xxx.ngrok-free.app`).

## 3. Client Setup (Terminal 3)
1. Navigate to the `client` folder.
2. Create/Update `.env`:
   ```env
   VITE_SOCKET_URL=https://xxxx-xxx.ngrok-free.app (PASTE THE SERVER NGROK URL HERE)
   ```
3. Run the client:
   ```bash
   npm run dev
   ```
4. Start ngrok for the client (Terminal 4):
   ```bash
   ngrok http 5173
   ```
5. **Copy the Client ngrok URL**.

## 4. Testing Flow
1. Open your **Client ngrok URL** in your browser.
2. Create a room as a **Teacher**.
3. Use the **Copy Link** button in the dashboard.
4. Send that link to your friends!
5. When they open the link, they will be prompted for their name and then automatically join your classroom.

## 5. Troubleshooting
- **CORS Errors**: Ensure the `CLIENT_URL` in `server/.env` matches your client's local or ngrok URL. The server is configured to automatically allow any `ngrok-free.app` domain.
- **Socket Disconnect**: Check if the `VITE_SOCKET_URL` in the client matches the server's current ngrok URL.
- **Jitsi Permissions**: Ensure you allow camera and microphone access when prompted by the browser.
