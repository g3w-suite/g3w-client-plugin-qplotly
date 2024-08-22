import pluginConfig       from './config';
import MultiPlotComponent from './components/sidebar/Multiplot.vue';
import Service            from './service';

const { GUI }              = g3wsdk.gui;
const { Plugin:BasePlugin} = g3wsdk.core.plugin;

new (class Plugin extends BasePlugin {
  constructor() {
    const {name, i18n} = pluginConfig;
    super({
      name,
      service: Service,
      i18n
    });

    this.service.once('ready', () => {
      if (this.registerPlugin(this.config.gid)) {
        this.setupGUI();
        this.setReady(true);
      }
    });

    this.service.init(this.config);
  }

  setupGUI() {

    this.createSideBarComponent(MultiPlotComponent,
      {
        id:          'qplotly',
        title:       'plugins.qplotly.title',
        open:        false,
        collapsible: true,
        iconConfig: {
          color: 'red',
          icon:  'chart-area',
        },
        mobile: true,
        events: {
          open: {
            when: 'before',
            cb: async bool => {
              await this.service.showChart(bool);
            }
          }
        },
        sidebarOptions: { position: 1 }
      });
  };

  unload() {
    this.service.clear();
  }
});

