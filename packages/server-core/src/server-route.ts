/** Validate one explicit mount; requests cannot select another handler namespace. */
export function createMountedPath(basePath = ''): (pathname: string) => string | null {
  if (
    typeof basePath !== 'string' ||
    (basePath !== '' &&
      (!/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(basePath) ||
        basePath.split('/').some((segment) => segment === '.' || segment === '..')))
  )
    throw new TypeError('Invalid server base path');
  return (pathname) => {
    if (basePath === '') return pathname;
    return pathname.startsWith(basePath + '/') ? pathname.slice(basePath.length) : null;
  };
}
