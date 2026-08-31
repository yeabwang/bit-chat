export default {
  "*.ts": ["eslint --fix", "prettier --write", () => "tsc --noEmit"],
  "*.{json,md,yml}": ["prettier --write"],
};
