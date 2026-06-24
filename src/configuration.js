function toTrailingSlash(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const text = String(value);
  return text.endsWith("/") ? text : `${text}/`;
}

function isAbsoluteUrl(value) {
  return /^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value);
}

function stripAssetPrefix(path) {
  return String(path)
    .replace(/^EzTree\/assets\//, "")
    .replace(/^assets\//, "");
}

const configuration = {
  assetBaseUrl: toTrailingSlash(
    new URL(/* @vite-ignore */ "assets/", import.meta.url).href,
  ),
  workerBaseUrl: toTrailingSlash(
    new URL(/* @vite-ignore */ "workers/", import.meta.url).href,
  ),
  workerUrls: Object.create(null),
  useWorkers: true,
};

function configureEzTree(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "assetBaseUrl")) {
    configuration.assetBaseUrl = toTrailingSlash(options.assetBaseUrl);
  }
  if (Object.prototype.hasOwnProperty.call(options, "workerBaseUrl")) {
    configuration.workerBaseUrl = toTrailingSlash(options.workerBaseUrl);
  }
  if (Object.prototype.hasOwnProperty.call(options, "workerUrls")) {
    configuration.workerUrls = Object.assign(
      Object.create(null),
      options.workerUrls ?? {},
    );
  }
  if (Object.prototype.hasOwnProperty.call(options, "useWorkers")) {
    configuration.useWorkers = options.useWorkers !== false;
  }

  return getEzTreeConfiguration();
}

function getEzTreeConfiguration() {
  return {
    assetBaseUrl: configuration.assetBaseUrl,
    workerBaseUrl: configuration.workerBaseUrl,
    workerUrls: Object.assign({}, configuration.workerUrls),
    useWorkers: configuration.useWorkers,
  };
}

function getEzTreeAssetUrl(path) {
  const text = String(path);
  if (isAbsoluteUrl(text) || text.startsWith("/")) {
    return text;
  }

  const relativePath = stripAssetPrefix(text);
  return new URL(relativePath, configuration.assetBaseUrl).href;
}

function getEzTreeWorkerUrl(workerName) {
  const override = configuration.workerUrls[workerName];
  if (override !== undefined) {
    return override;
  }

  return new URL(`${workerName}.js`, configuration.workerBaseUrl).href;
}

function getEzTreeUseWorkers() {
  return configuration.useWorkers;
}

export {
  configureEzTree,
  getEzTreeAssetUrl,
  getEzTreeConfiguration,
  getEzTreeUseWorkers,
  getEzTreeWorkerUrl,
};
