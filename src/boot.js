/* Keep startup failures readable, including accidentally opening index.html as
 * a local file. App data stays in the current browser's local storage. */
(() => {
  const byId = id => document.getElementById(id);
  const status = byId('startup-status');
  const fail = (title, description, error) => {
    document.body.dataset.appState = 'error';
    status.hidden = false;
    byId('startup-title').textContent = title;
    byId('startup-description').textContent = description;
    byId('startup-actions').hidden = false;
    byId('startup-retry').onclick = () => location.reload();
    if (error) {
      byId('startup-details').hidden = false;
      byId('startup-error').textContent = String(error.message || error);
    }
  };
  if (location.protocol === 'file:') {
    fail('请通过启动器打开工作台', '在同一文件夹双击「启动RealLoad.command」。浏览器不能从直接打开的 HTML 文件载入完整应用。启动后也可打开下方默认本机地址；若启动器提示其他端口，请使用它显示的地址。');
    byId('startup-retry').hidden = true;
    return;
  }
  byId('startup-open').href = location.origin + '/';
  import('./app.mjs').then(() => {
    document.body.dataset.appState = 'ready';
    status.hidden = true;
  }).catch(error => {
    fail('工作台未能完成启动', '请先重新载入。若仍失败，重新解压完整项目，并通过「启动RealLoad.command」打开。当前浏览器已保存的规划不会被清空。', error);
  });
})();
