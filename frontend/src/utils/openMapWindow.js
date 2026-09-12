export const mapHref = (path) => (
  path.startsWith('http') ? path : `${window.location.origin}${path}`
);

export const openMapWindow = (path) => {
  const url = mapHref(path);
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
};
