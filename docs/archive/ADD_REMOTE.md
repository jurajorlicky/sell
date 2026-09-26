# Pridanie Remote Repository

## Ak už máte repository na GitHub/GitLab/Bitbucket:

```bash
# Nahraďte URL svojím skutočným URL repozitára
git remote add origin https://github.com/VAS-USERNAME/VAS-REPO.git

# Alebo ak používate SSH:
git remote add origin git@github.com:VAS-USERNAME/VAS-REPO.git

# Potom pushnúť:
git push -u origin main
```

## Ak ešte nemáte repository:

1. Vytvorte nový repository na GitHub/GitLab
2. Skopírujte URL repository
3. Spustite príkazy vyššie

## Cez Cursor:

1. Otvorte Source Control panel (Ctrl/Cmd + Shift + G)
2. Kliknite na "..." (tri body) v Source Control
3. Vyberte "Remote" > "Add Remote"
4. Zadajte názov: `origin`
5. Zadajte URL vášho repozitára
6. Pushnite zmeny



