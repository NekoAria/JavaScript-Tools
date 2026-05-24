/** @type {import('stylelint').Config} */
const stylelintConfig = {
  extends: ['stylelint-config-recess-order'],
  ignoreFiles: ['userscripts/**', '**/*.min.css'],
};

export default stylelintConfig;
