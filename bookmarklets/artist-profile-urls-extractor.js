// Based on TypeA2's original bookmarklet: https://gist.github.com/TypeA2/dc1bb0ba549369dd079f15e44e5623eb

const showError = (message) => {
  alert(`Error: ${message}`);
};

const displayResult = (result, host) => {
  const output = [result.primaryUrl, result.secondaryUrl].filter(Boolean).join('\n');

  if (navigator.userAgent.toLowerCase().includes('firefox')) {
    alert(output);
  } else {
    prompt(`${host} URLs`, output);
  }
};

(async () => {
  const { extractProfileUrls } =
    await import('../packages/artist-profile-urls-extractor/src/extractor.ts');
  const { host } = location;

  try {
    const profileUrls = await extractProfileUrls({
      requireAdditionalUrl: false,
      throwOnFailure: true,
    });

    if (!profileUrls) {
      showError(`Unable to extract profile URLs from ${host}`);

      return;
    }

    displayResult(profileUrls, host);
  } catch (error) {
    showError(error.message);
  }
})();
