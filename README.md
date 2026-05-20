# ELRS Android Bridge

A web-based interface for interacting with ELRS radios via a Wi-Fi-enabled backpack. This project uses a service worker and a bridge mechanism to handle communication between the web interface and the radio hardware.

## Project Structure

- **`bridge.js`**: Contains the core logic for bridging communication between the web app and the radio hardware.
- **`index.html`**: The main entry point for the application.
- **`radar.js`**: Handles the radar/map visualization and logic.

### Utils

The remaining files (e.g., `sw.js`, `style.css`, `manifest.json`) are part of the web app infrastructure and testing environment.

## Deployment on Android (via Termux)

To run this application locally on an Android device using **Termux**, follow these instructions to ensure the web server stays active and starts on boot.

### 1. Prerequisites

Install **Termux** from F-Droid (not Play Store) and the following modules:

- **Termux:API** (for system integration)
- **Termux:Web** (optional, for easier browsing)

### 2. Setup Environment

Open Termux and run the following commands to install necessary packages:

```bash
# Update packages
pkg update && pkg upgrade

# Install Node.js (to run a local web server)
pkg install nodejs

# Install termux-tools (for system commands)
pkg install termux-tools
```

### 3. Prevent Sleep (Wake Lock)

To prevent Android from killing the Termux process when the screen is off:

1. Open Termux.
2. Run:

   ```bash
   termux-wake-lock
   ```

### 4. Auto-Start on Boot (termux-boot)

To ensure your web server starts automatically whenever the device boots:

1. Install the **Termux:Boot** add-on.
2. Create the boot directory:

   ```bash
   mkdir -p ~/.termux/boot
   ```

3. Create a script inside that directory:

   ```bash
   nano ~/.termux/boot/start-elrs-bridge.sh
   ```

4. Add the following content to the script (adjust the path to your project):

   ```bash

   #!/data/data/com.termux/files/usr/bin/sh
   sleep 15
   termux-wake-lock
   cd ~/storage/downloads/elrs/
   pkill -f "node bridge.js"
   nohup node bridge.js > ~/elrs.log 2>&1 &

   ```

5. Make the script executable:

   ```bash
   chmod +x ~/.termux/boot/start-elrs-bridge.sh
   ```

### 5. Accessing the App

Once the server is running, open your Android browser (Chrome/Firefox) and navigate to:

`http://localhost:8181` (or whichever port your server is using).
