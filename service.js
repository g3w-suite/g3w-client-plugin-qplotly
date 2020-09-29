import MultiPlot from './components/sidebar/multiplot';
const { base, inherit, XHR ,debounce} =  g3wsdk.core.utils;
const GUI = g3wsdk.gui.GUI;
const ComponentsFactory = g3wsdk.gui.ComponentsFactory;
const PluginService = g3wsdk.core.plugin.PluginService;
const QPlotlyComponent = require('./components/content/qplotly');
let BASEQPLOTLYAPIURL = '/qplotly/api/trace';

function Service(){
  base(this);
  this.mapService = GUI.getComponent('map').getService();
  this.loadedplots = {};
  this.loading = false;
  this.state = Vue.observable({
    loading: false
  });
  this.init = function(config={}){
   this.config = config;
   this.config.plots.forEach((plot, index)=>{
     plot.show = index === 0;
     plot.label = plot.plot.layout.title ||  `Plot id [${plot.id}]`;
   });
   BASEQPLOTLYAPIURL = `${BASEQPLOTLYAPIURL}/${this.getGid()}`;
   this.loadscripts();
  };
  
  this.createSideBarComponent = function(){
    const vueComponentObject = MultiPlot({
      service : this
    });
    const QPlotlySiderBarComponent = ComponentsFactory.build(
      {
        vueComponentObject
      },
      {
        id: 'qplotly',
        title: 'plugins.qplotly.title',
        open: false,
        collapsible: true,
        iconColor: 'red',
        icon: GUI.getFontClass('chart-area'),
        mobile: true,
        events: {
          open: {
            when: 'before',
            cb: bool => this.showChart(bool)
          }
        }
      }
    );
    const options = {
      position: 1
    };

    GUI.addComponent(QPlotlySiderBarComponent, 'sidebar', options);

    this.mapService.on('mapcontrol:active', ()=>{
      if (QPlotlySiderBarComponent.getOpen()) {
        QPlotlySiderBarComponent.click({
          open: false
        });
      }
    });

    this.once('clear', () => {
      GUI.removeComponent('qplotly', 'sidebar', options)
    })
  };

  //load scripts from server
  this.loadscripts = async function(){
    for (const script of this.config.jsscripts) {
      const promise = new Promise((resolve, reject) => {
        $.getScript(script)
          .done(() => {
            resolve();
          }).fail(() => {
          reject();
        })
      });
      await promise;
    }
    this.emit('ready');
  };

  this.showPlot = async function(plot){
    plot.show = true;
    const id = plot.id;
    const type = plot.plot.type;
    if (type === 'pie') {
      this.config.plots.forEach(plot => {
        if (plot.id !== id)  plot.show = false
      })
    } else {
      this.config.plots.forEach(plot => {
        if (plot.plot.type === 'pie')  plot.show = false
      })
    }
    const charts = await this.getCharts();
    this.emit('change-charts', charts);
  };

  this.hidePlot = async function(plot){
    plot.show = false;
    const charts = await this.getCharts();
    this.emit('change-charts', charts);
  };

  this.getPlots = function(){
    return this.config.plots;
  };

  this.clearLoadedPlots = function () {
    this.loadedplots = {}
  };

  this.getCharts = function(){
    GUI.setLoadingContent(true);
    this.state.loading = true;
    return new Promise((resolve, reject) => {
      const charts = {
        data:[],
        layout:[]
      };
      const promises = [];
      //get anly plot show
      const plots =  this.config.plots.filter(plot => plot.show);
      if (Promise.allSettled) {
       plots.forEach(plot => {
         const promise = this.loadedplots[plot.id] ? Promise.resolve(this.loadedplots[plot.id]) : XHR.get({url: `${BASEQPLOTLYAPIURL}/${plot.id}`});
         promises.push(promise)
        });
        Promise.allSettled(promises).then(async promisesData=>{
          promisesData.forEach((promise, index) =>{
            if (promise.status === 'fulfilled') {
              if (promise.value.result) {
                const data = promise.value.data;
                const plot = plots[index];
                this.loadedplots[plot.id] = {
                  result: true,
                  data
                };
                charts.data.push(data[0]) ;
                charts.layout.push(plot.plot.layout)
              }
            }
          });
          resolve(charts);
        }).finally(()=>{
          GUI.setLoadingContent(false);
          this.state.loading = false;
        })
      } else {
        plots.forEach( async (plot, index) => {
          try {
            const response = await XHR.get({url: `${BASEQPLOTLYAPIURL}/${plot.id}`});
            response.result && charts.data.push(response.data);
            charts.layout.push(plots[index].layout)
          } catch(err){}
        });
        resolve(charts);
        GUI.setLoadingContent(false);
        this.state.loading = false;
      }
    })
  };

  this.getChartLayout = function (id) {
    return this.config.plots[0].layout;
  };

  this.getChartConfig = function(id){
    return this.config.plots[0].config;
  };

  this.showChart = function(bool){
    bool && setTimeout(()=>{
      this.mapService.deactiveMapControls();
      GUI.showContent({
        closable: false,
        title: 'plugins.qplotly.title',
        content: new QPlotlyComponent({
          service: this
        }),
        perc: 50
      })
    }, 300) || this.mapService.activeMapControl('query') || GUI.closeContent();
  };

  this.clear = function(){
    this.emit('clear');
    this.mapService = null;
    GUI.closeContent();
  };
}

inherit(Service, PluginService);

module.exports = new Service;

 