import MultiPlot from './components/sidebar/multiplot';
const { base, inherit, XHR } =  g3wsdk.core.utils;
const { transformBBOX } = g3wsdk.core.geoutils;
const GUI = g3wsdk.gui.GUI;
const ApplicationState = g3wsdk.core.ApplicationState;
const ComponentsFactory = g3wsdk.gui.ComponentsFactory;
const PluginService = g3wsdk.core.plugin.PluginService;
const CatalogLayersStoresRegistry = g3wsdk.core.catalog.CatalogLayersStoresRegistry;
const QPlotlyComponent = require('./components/content/qplotly');
let BASEQPLOTLYAPIURL = '/qplotly/api/trace';

function Service(){
  this.setters = {
    chartsReady(){} // hook called when chart is show
  };
  base(this);
  this.mapService = GUI.getComponent('map').getService();
  this.mapCrs = this.mapService.getCrs();
  this.loadedplots = {};
  this.loading = false;
  this.showCharts = false;
  this.state = Vue.observable({
    loading: false,
    geolayer: false,
    positions: [],
    tools: {
      map: {
        toggled: false,
        disabled: false
      }
    }
  });
  this.reloaddata = false;
  this.relationData = null;
  this._relationIdName = {};
  this.customParams = {
    bbox: undefined
  };
  this.keyMapMoveendEvent = {
    key: null,
    plotIds: []
  };
  this.mainbboxtool = false;
  let layersId = new Set();
  this.init = function(config={}){
    this.config = config;
    this.chartContainers = [];
    this.changeChartsEventHandler = async ({layerId}) =>{
      // change if one of these condition is true
      const change = this.showCharts && !this.relationData && !!this.config.plots.find(plot=> this.customParams.bbox || plot.qgs_layer_id === layerId && plot.show);
      // in case of a filter is change on showed chart it redraw the chart
      if (change) {
        const plotreload = [];
        const subplots = this.keyMapMoveendEvent.plotIds.length > 0;
        subplots && this.keyMapMoveendEvent.plotIds.forEach(plotId => {
          const plot = this.config.plots.find(plot => plot.id === plotId.id);
          plot.loaded = false;
          plotreload.push(plot);
        });
        this.reloaddata = true;
        this.setBBoxParameter(subplots);
        try {
          const plotIds = subplots && this.getPlotsIdsToLoad({
            plots: plotreload,
            use: true
          }) || undefined;
          await this.getChartsAndEmit({
            plotIds
          });
        } catch(e){}
        this.reloaddata = false;
      } else if (layerId) {
        const plot = this.config.plots.find(plot => plot.qgs_layer_id === layerId);
        plot.loaded = false;
      }
    };
    this.config.plots.forEach((plot, index)=>{
     this.state.positions.push(plot.id); 
     plot.show = index === 0;
     plot.withrelations = null;
     plot.request = true;
     plot.loaded = plot.show;
     plot.plot.layout._title = plot.plot.layout.title;
     plot.label = plot.plot.layout.title ||  `Plot id [${plot.id}]`;
     // set automargin
     plot.plot.layout.xaxis.automargin = true;
     plot.plot.layout.yaxis.automargin = true;
     plot.filters = [];
     const layerId = plot.qgs_layer_id;
     //end automargin
     layersId.add(layerId);
     // listen layer change filter to reload the charts
     const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
     const geolayer = layer.isGeoLayer();
     plot.crs = geolayer ? layer.getCrs() : undefined;
     plot.tools = {
       filter: layer.getFilter(),
       selection: layer.getSelection(),
       geolayer: {
         show: geolayer,
         active: false
       }
     };
     // set relations
     if (layer.isFather()){
       const relations = [];
       layer.getRelations().getArray().forEach(relation =>{
         relation.getFather() === layerId && relations.push({
           id: relation.getId(), // relation id
           relationLayer: relation.getChild(), // relation layer child
           use: false // use to get data of related plot
         });
         this._relationIdName[relation.getId()] = relation.getName();
       });
       plot.withrelations = relations
     }
     
     layer.on('filtertokenchange', this.changeChartsEventHandler)
   });
   BASEQPLOTLYAPIURL = `${BASEQPLOTLYAPIURL}/${this.getGid()}`;
   this.loadscripts();
   this.queryResultService = GUI.getComponent('queryresults').getService();
   this.showChartsOnContainer = (ids, container, relationData) => {
     const find = this.chartContainers.find(queryresultcontainer => container.selector === queryresultcontainer.container.selector);
     !find && this.chartContainers.push({
       container,
       component: null
     });
     this.showChart(!find, ids, container, relationData);
   };

   this.clearChartContainers = container => {
     this.chartContainers = this.chartContainers.filter(queryResultsContainer =>  {
       if (!container || (container.selector === queryResultsContainer.container.selector)) {
           $(queryResultsContainer.component.$el).remove();
           queryResultsContainer.component.$destroy();
          return false
         } else return true;
     });
   };

   this.queryResultService.addLayersPlotIds([...layersId]);
   this.queryResultService.on('show-chart', this.showChartsOnContainer);
   this.queryResultService.on('hide-chart', this.clearChartContainers);
   this.closeComponentKeyEevent = this.queryResultService.onceafter('closeComponent', this.clearChartContainers);
   this.setContentChartTools();
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
            cb: async bool => {
              bool && GUI.disableSideBar(true);
              await this.showChart(bool);
              bool ? setTimeout(()=>{
                GUI.disableSideBar(false);
              },500) : this.config.plots.forEach(plot => plot.loaded = false);
            }
          }
        }
      }
    );
    const options = {
      position: 1
    };

    GUI.addComponent(QPlotlySiderBarComponent, 'sidebar', options);

    /*this.mapService.onbefore('controlClick', ({target})=>{
      if (target.name !== 'zoombox' && QPlotlySiderBarComponent.getOpen()) {
        QPlotlySiderBarComponent.click({
          open: false
        });
      }
    });*/

    this.once('clear', () => GUI.removeComponent('qplotly', 'sidebar', options));
  };

  this.toggleLayerFilter = function(layerId){
    const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
    layer && layer.toggleFilterToken();
  };

  //load scripts from server
  this.loadscripts = async function(){
    for (const script of this.config.jsscripts) {
      const promise = new Promise((resolve, reject) => {
        $.getScript(script)
          .done(() => resolve())
          .fail(() => reject())
      });
      await promise;
    }
    this.emit('ready');
  };

  this.setActiveFilters = function(plot){
    plot.filters = [];
    plot.tools.filter.active && plot.filters.push('filtertoken');
    if (plot.tools.geolayer.active) plot.filters.length ? plot.filters[0] = 'in_bbox_filtertoken' : plot.filters.push('in_bbox');
  };

  this.getChartsAndEmit = async function({plotIds} ={}){
    const {charts, order} = await this.getCharts({
      plotIds
    });
    this.emit('change-charts', {
      charts,
      order
    });
  };
  //check if had to reload data of parent relation

  this.getPlotsIdsToLoad = function({plots=[], use=false}={}){
    let plotIds = [];
    plots.forEach(plot =>{
      const plotIdsToLoad = this.getPlotIdsToLoad({
        plot,
        use
      });
      if (plotIdsToLoad.length) {
        plotIdsToLoad.forEach(plotIdToLoad=>{
          const find = plotIds.find(ploId => plotIdsToLoad.id === plotIdToLoad.id);
          !find && plotIds.push(plotIdToLoad);
        })
      } else plotIds.push({
        id: plot.id,
        relation: false
      })
    });
    return plotIds;
  };

  /*
  use: true, false
  * */
  this.getPlotIdsToLoad = function({plot, use}) {
    let reload = [];
    // if has a relations
    if (plot.withrelations) {
      // check if chart in relation is show
      plot.withrelations.forEach(plotrelation => {
        this.config.plots.forEach(plot => {
          if (plot.show && plot.qgs_layer_id === plotrelation.relationLayer){
            plotrelation.use = use;
            reload.push({
              id:plot.id,
              relation: use
            });
          }
        });
        use && reload.length && reload.push({
          id: plot.id,
          relation: false
        })
      });
    } else {
      this.config.plots.forEach(_plot => {
        if (_plot.id !== plot.id && _plot.show){
          const relations = _plot.withrelations;
           relations && relations.find((plotrelation, index) => {
             if (plotrelation.relationLayer === plot.qgs_layer_id){
               relations[index].use = use;
               reload.push({
                 id: _plot.id,
                 relation: false
               });
               return true
            }
           });}
      });
      use && reload.length && reload.push({
        id:plot.id,
        relation: true
      });
    }
    return reload;
  };

  this.showPlot = async function(plot){
    // only if geolayer
    if (plot.tools.geolayer.show){
      plot.tools.geolayer.active =  this.state.tools.map.toggled;
      if (this.keyMapMoveendEvent.key){
        this.keyMapMoveendEvent.plotIds.push({
          id: plot.id,
          active: this.state.tools.map.toggled
        })
      }
    }
    this.setContentChartTools();
    const chartstoreload = this.getPlotIdsToLoad({
      plot,
      use: true
    });
    if (chartstoreload.length) await this.getChartsAndEmit({
      plotIds: chartstoreload
    });
    else {
      const {charts, order} = this.createChartsObject();
      if (plot.loaded)
        this.emit('show-hide-chart', {
          plotId:plot.id,
          action: 'show',
          charts,
          order
        });
      else {
        await this.getChartsAndEmit({
          plotIds:[{
            id:plot.id,
            relation: false
          }]
        });
        plot.loaded = true;
      }
    }
  };

  this.hidePlot = async function(plot){
    if (plot.tools.geolayer.show){
      if (plot.tools.geolayer.active) plot.loaded = false;
      plot.tools.geolayer.active = false;
      if (this.keyMapMoveendEvent.key) this.keyMapMoveendEvent.plotIds = this.keyMapMoveendEvent.plotIds.filter(plotId => plot.id !== plotId.id);
      if (this.keyMapMoveendEvent.plotIds.length === 0) {
        this.customParams.bbox = void 0;
        this.state.tools.map.toggled = false;
      }
    }
    this.setContentChartTools();
    // check if we had to reload based on relation
    const chartstoreload = this.getPlotIdsToLoad({
      plot,
      use: false
    });

    this.setActiveFilters(plot);
    const {charts, order} = chartstoreload.length && await this.getCharts({plotIds: chartstoreload}) || this.createChartsObject();
    this.emit('show-hide-chart', {
      plotId:plot.id,
      action: 'hide',
      filter: plot.filters,
      charts,
      order
    });
  };

  this.createChartsObject = function({order}={}){
    return {
      order: order || this.config.plots.filter(plot=> plot.show).map(plot => plot.id),
      charts: {}
    }
  };

  this.getPlots = function(){
    return this.config.plots;
  };

  this.clearLoadedPlots = function() {
    this.loadedplots = {};
    this.state.tools.map.toggled = false;
    this.customParams.bbox = undefined;
    this.handleKeyMapMoveendEvent({
      listen: false
    });
    this.config.plots.forEach(plot => {
      plot.tools.geolayer.active = false;
      plot.filters = [];
    });
    this.showCharts = false;
  };

  this.setBBoxParameter = function(force=false){
    this.customParams.bbox = force || this.state.tools.map.toggled ? this.mapService.getMapBBOX().toString() : undefined;
  };

  this.showMapFeaturesSubPlotsCharts = async function(plotIds=[]){
    this.mainbboxtool = false;
    this.setBBoxParameter(true);
    this.handleKeyMapMoveendEvent({
      listen:true,
      plotIds
    });
    const _plotIds = plotIds.map(plotId => plotId.id);
    const plots = this.config.plots.filter(plot => {
      const find = _plotIds.find(plotId => plotId === plot.id);
      return find !== undefined;
    });

    return await this.getCharts({
      plotIds: this.getPlotsIdsToLoad({
        plots,
        use: true
      })
    });
  };

  this.handleKeyMapMoveendEvent = function({listen=false, plotIds=[]}={}){
    if (listen) {
      this.keyMapMoveendEvent.plotIds = plotIds;
      this.keyMapMoveendEvent.key =  this.keyMapMoveendEvent.key || this.mapService.getMap().on('moveend', this.changeChartsEventHandler);
    } else {
      ol.Observable.unByKey(this.keyMapMoveendEvent.key);
      this.keyMapMoveendEvent.key = null;
      this.keyMapMoveendEvent.plotIds = [];
    }
  };

  // methods reload chart data for every charts
  this.showMapFeaturesAllCharts = async function(change=false){
    let charts;
    this.mainbboxtool = true;
    this.reloaddata = true;
    this.state.tools.map.toggled = change ? !this.state.tools.map.toggled: this.state.tools.map.toggled;
    this.setBBoxParameter();
    const activeGeolayerPlots = this.config.plots.filter(plot => {
      plot.tools.geolayer.active = plot.tools.geolayer.show && this.state.tools.map.toggled;
      return plot.show && (this.state.tools.map.toggled && plot.tools.geolayer.active || true)
    });
    this.handleKeyMapMoveendEvent({
      listen: this.state.tools.map.toggled,
      plotIds: activeGeolayerPlots.map(plot => ({
        id: plot.id,
        active: plot.tools.geolayer.active
      }))
    });
    try {
      const plotIds = this.getPlotsIdsToLoad({
        plots: activeGeolayerPlots,
        use: true
      });
      charts = await this.getCharts({
        plotIds
      });
    } catch(e){}
    this.reloaddata = false;
    return charts;
  };

  this.setContentChartTools = function(){
    this.state.geolayer = !!this.config.plots.find(plot => plot.show && plot.tools.geolayer.show);
  };

  this.getCharts = async function({layerIds, plotIds, relationData}={}){
    this.relationData = this.reloaddata ? this.relationData : relationData;
    if (this.relationData) this.state.loading = true;
    if (!layerIds) {
      GUI.disableSideBar(true);
      await GUI.setLoadingContent(true);
    }
    this.onceafter('chartsReady', async ()=>{
      if (!layerIds) {
        GUI.disableSideBar(false);
        await GUI.setLoadingContent(false);
      } if (this.relationData) this.state.loading = false;
    });
    return new Promise(resolve => {
      let plots;
      if (layerIds) {
        plots = this.config.plots.filter(plot => layerIds.indexOf(plot.qgs_layer_id) !== -1);
      } else if (plotIds) {
        plots = this.config.plots.filter(plot => {
          const findplot = plotIds.find(plotId => plotId.id === plot.id);
          if (findplot) {
            plot.request = !findplot.relation;
            return true;
          }
          else return false;
        });
      } else plots = this.config.plots.filter(plot => plot.show);
      const chartsObject = this.createChartsObject({
        order: layerIds && plots.map(plot => plot.id)
      });
      // set main map visibile filter tool
      // check if is supported
      if (Promise.allSettled) {
        const promises = [];
        plots.forEach(plot => {
          let promise;
          // in case of no request (relation) and not called from query
          if (!relationData && !plot.request) {
            promise = Promise.resolve({
              result: true,
              relation:true
            });
          } else {
            const addInBBoxParam = this.keyMapMoveendEvent.plotIds.length > 0 ? this.keyMapMoveendEvent.plotIds.filter(plotIds => plotIds.active).map(plotId => plotId.id).indexOf(plot.id) !== -1 : true;
            let withrelations;
            if (plot.withrelations) {
              const inuserelation = plot.withrelations.filter(plotrelation => plotrelation.use);
              withrelations = inuserelation.length ? inuserelation.map(plotrelation=> plotrelation.id).join(','): undefined;
            }
            const relationonetomany = this.relationData ? `${this.relationData.relations.find(relation => plot.qgs_layer_id === relation.referencingLayer).id}|${this.relationData.fid}` : undefined;
            let in_bbox;
            if (addInBBoxParam && this.customParams.bbox) in_bbox =  plot.crs === this.mapCrs ? this.customParams.bbox :
              transformBBOX({
                bbox: this.customParams.bbox.split(','),
                sourceCrs: this.mapCrs,
                destinationCrs: plot.crs
              }).join(',');
            promise = !this.reloaddata && this.loadedplots[plot.id] ? Promise.resolve(this.loadedplots[plot.id]) : XHR.get({
              url: `${BASEQPLOTLYAPIURL}/${plot.id}`,
              params: {
                withrelations,
                filtertoken: ApplicationState.tokens.filtertoken || undefined,
                relationonetomany,
                in_bbox
              }
            });
          }
          promises.push(promise);
        });
        Promise.allSettled(promises)
          .then(async promisesData =>{
            promisesData.forEach((promise, index) =>{

              if (promise.status === 'fulfilled' && promise.value.result) {
                const {data, relation, relations} = promise.value;
                if (relation) return; // in case of relation do nothing
                const plot = plots[index];
                this.setActiveFilters(plot);
                chartsObject.charts[plot.id] = {};
                const chart = chartsObject.charts[plot.id];
                chart.filters = plot.filters;
                chart.layout = plot.plot.layout;
                chart.tools = plot.tools;
                chart.layerId = plot.qgs_layer_id;
                plot.plot.layout.title = plot.plot.layout._title;
                chart.data = data[0];
                if (relations) {
                  Object.keys(relations).forEach(relationId =>{
                    const relationdata = relations[relationId];
                    relationdata.forEach(({id, data}) =>{
                      const fatherPlot = plots.find(plot => plot.withrelations && !!plot.withrelations.find(plotrelation => plotrelation.id === relationId));
                      const fatherPlotFilters = fatherPlot && fatherPlot.filters;
                      plots.find((plot, index) => {
                        if (plot.id === id){
                          this.setActiveFilters(plot);
                          chartsObject.charts[plot.id] = {};
                          const chart = chartsObject.charts[plot.id];
                          const layout = plot.plot.layout;
                          layout.title = `${this._relationIdName[relationId]} ${layout._title}`;
                          if (fatherPlotFilters.length) plot.filters.push(`relation.${fatherPlotFilters[0]}`);
                          chart.data = data[0];
                          chart.filters= plot.filters;
                          chart.layout = layout;
                          chart.tools = plot.tools;
                          chart.layerId = plot.qgs_layer_id;
                          return true;
                        }
                      });
                    })
                  });
                }
              } else {
                const plot = plots[index];
                this.setActiveFilters(plot);
                chartsObject.charts[plot.id] = {};
                const chart = chartsObject.charts[plot.id];
                chart.filters = plot.filters;
                chart.layout = plot.plot.layout;
                chart.tools = plot.tools;
                chart.layerId = plot.qgs_layer_id;
                chart.data = null;
              }
            });
            this.showCharts = true;
            this.removeInactivePlotIds();
            resolve(chartsObject);
          })
      }
    });
  };

  this.removeInactivePlotIds = function(){
    if (!this.state.tools.map.toggled){
      this.keyMapMoveendEvent.plotIds = this.keyMapMoveendEvent.plotIds.filter(plotId => plotId.active);
      this.keyMapMoveendEvent.plotIds.length === 0 && this.keyMapMoveendEvent.key && this.handleKeyMapMoveendEvent({listen: false});
    }
  };

  this.getChartLayout = function (id) {
    return this.config.plots[0].layout;
  };

  this.getChartConfig = function(id){
    return this.config.plots[0].config;
  };

  this.showChart = function(bool, ids, container, relationData){
    return new Promise(resolve =>{
      if (bool) {
        setTimeout(()=>{
          const content =  new QPlotlyComponent({
            service: this,
            ids,
            relationData
          });
          const component = content.getInternalComponent();
          if (container) {
            component.$once('hook:mounted', async function(){
              container.append(this.$el);
              GUI.emit('resize');
            });
            component.$mount();
            this.chartContainers.find(queryResultsContainer => container.selector === queryResultsContainer.container.selector).component = component;
          } else {
            // called from sidebar component
            this.onceafter('chartsReady', ()=> {
              resolve()
            });
            //this.mapService.deactiveMapControls();
            GUI.showContent({
              closable: false,
              title: 'plugins.qplotly.title',
              style: {
                title: {
                  fontSize: '1.3em',
                  marginBottom: '20px'
                }
              },
              content,
              perc: 50
            });
          }
        })
      } else {
        if (container) this.clearChartContainers(container);
        else GUI.closeContent();
        resolve();
      }
    })
  };

  this.clear = function(){
    GUI.removeComponent('qplotly', 'sidebar', {position: 1});
    this.emit('clear');
    // listen layer change filter to reload the charts
    layersId.forEach(layerId => {
      const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
      layer && layer.off('filtertokenchange', this.changeChartWhenFilterChange)
    });
    this.mapService = null;
    this.chartContainers = [];
    this.queryResultService.removeListener('show-charts', this.showChartsOnContainer);
    this.queryResultService.un('closeComponent', this.closeComponentKeyEevent);
    this.closeComponentKeyEevent = null;
    GUI.closeContent();
    layersId = null;
    this.mainbboxtool = null;
    this.queryResultService = null;
  };
}

inherit(Service, PluginService);

module.exports = new Service;

 