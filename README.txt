MEH450 encrypted website

This repository contains only the encrypted website release and its public password screen. The engineering project and its Git history remain in a separate private repository. The password is not stored in this repository.

Website: https://defectdyson.github.io/meh450-viewer/

Deployment: Settings > Pages > Build and deployment > Source > GitHub Actions. The workflow deploys public/ only.

Application content, models, textures and downloads are encrypted with AES-256-GCM before publication. Decryption happens in authorized browsers. Client-side encryption has no online rate limiting; protection depends on password strength.
