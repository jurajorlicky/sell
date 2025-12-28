# Inštrukcie na Push do GitHub

Remote repository bol úspešne pridaný: `https://github.com/jurajorlicky/sell.git`

## Spôsob 1: Cez Cursor Git UI (najjednoduchšie)

1. Otvorte Source Control panel v Cursor (Ctrl/Cmd + Shift + G)
2. Kliknite na "..." (tri body) v pravom hornom rohu
3. Vyberte "Push" alebo "Push to..."
4. Cursor vás vyzve na autentifikáciu s GitHubom
5. Postupujte podľa inštrukcií

## Spôsob 2: Cez GitHub CLI (ak máte nainštalovaný)

```bash
gh auth login
git push -u origin main
```

## Spôsob 3: Nastavenie SSH (odporúčané pre budúcnosť)

1. Vygenerujte SSH kľúč (ak ho ešte nemáte):
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

2. Pridajte SSH kľúč do GitHub:
```bash
cat ~/.ssh/id_ed25519.pub
# Skopírujte výstup a pridajte do GitHub Settings > SSH and GPG keys
```

3. Zmeňte remote URL na SSH:
```bash
git remote set-url origin git@github.com:jurajorlicky/sell.git
git push -u origin main
```

## Spôsob 4: Personal Access Token

1. Vytvorte Personal Access Token na GitHub:
   - Settings > Developer settings > Personal access tokens > Tokens (classic)
   - Generate new token
   - Vyberte scope: `repo`

2. Použite token pri push:
```bash
git push -u origin main
# Username: váš GitHub username
# Password: váš Personal Access Token (nie heslo!)
```

**Odporúčanie**: Použite Spôsob 1 (Cursor Git UI) - je najjednoduchší a najbezpečnejší.


