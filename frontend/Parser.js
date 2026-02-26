class Parser {
  static firstLineBold(text) {
    const endIndex = text.indexOf("\n");
    const firstLine = text.substring(0, endIndex);
    const res = "<b>" + firstLine + "</b>" + text.substring(endIndex);
    return res;
  }
}
