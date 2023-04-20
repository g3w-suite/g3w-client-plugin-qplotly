import HeaderContentAction from './components/content/headeraction.vue';

const {base,inherit,XHR,debounce,toRawType} =  g3wsdk.core.utils;
const {GUI} = g3wsdk.gui;
const {ApplicationState} = g3wsdk.core;
const {PluginService} = g3wsdk.core.plugin;
const {CatalogLayersStoresRegistry} = g3wsdk.core.catalog;

const QPlotlyComponent = require('./components/content/qplotly');

let BASEQPLOTLYAPIURL = '/qplotly/api/trace';

function Service(){

  base(this);
  // get mapService
  this.mapService = GUI.getService('map');
  //get Query Service
  this.queryResultService = GUI.getService('queryresults');
  // get current map CRS
  this.mapCrs = this.mapService.getCrs();
  // initialize load plots as empty Object
  this.loadedplots = {};
  //Initial state is false
  this.loading = false;
  //Initial state is false
  this.showCharts = false;
  // set state of plugin reactive using Vue.observable
  this.state = Vue.observable({
    loading: false, // loading purpose
    geolayer: false,
    positions: [],
    tools: {
      map: {
        toggled: false,
        disabled: false
      }
    }
  });
  // relation data
  this.relationData = null;
  this._relationIdName = {};
  this.customParams = {
    bbox: undefined
  };
  //store Openlayers key event for map moveend
  this.keyMapMoveendEvent = {
    key: null,
    plotIds: []
  };
  this.mainbboxtool = false;
  let layersId = new Set();
  // init method service
  this.init = function(config={}){
    // get plugin config
    this.config = config;
    // charts container coming from query results
    this.chartContainers = [];
    //event handler of change chart
    //@param layerId Layer id passed by filter token add or remove to a specific layer
    this.changeChartsEventHandler = debounce(async ({layerId}) =>{
      // change if one of these condition is true
      const change = (
        (true === this.showCharts) &&
        ("undefined" === typeof this.relationData) &&
        ("undefined" !== this.config.plots
          .find(plot => this.customParams.bbox || (plot.qgs_layer_id === layerId && true === plot.show)))
      );
      // in case of a filter is change on showed chart it redraw the chart
      if (true === change) {
        //array of plot to reload
        const plotreload = [];
        //check if there is a plot that need to update data when move map
        const isTherePlotListensMoveEnd = this.keyMapMoveendEvent.plotIds.length > 0;
        //it there is a plot
        if (true === isTherePlotListensMoveEnd) {

          this.keyMapMoveendEvent.plotIds.forEach(plotId => {
            const plot = this.config.plots.find(plot => plot.id === plotId.id);
            plot.filters = [];
            plotreload.push(plot); //add plot to plot reaload
          });
        }

        this.setBBoxParameter(isTherePlotListensMoveEnd);

        // check if filtertoken is added or removed from layer
        if (layerId) {

          this.getShowPlots(true).forEach(plot => {
            if (plot.qgs_layer_id === layerId) {
              plotreload.push(plot);
            }
          });

        }
        try {

          let plotIds;

          if (plotreload.length > 0) {

            plotIds = plotreload.map((plot) => {
              //need to clear data of plot
              this.clearDataPlot(plot, false);
              return plot.id;
            })

          }

          await this.getChartsAndEmit({plotIds});

        } catch(e){}


      }
    }, 1500);

    //loop over plots
    this.config.plots.forEach((plot, index)=> {
      // in case of title is an object get text attribute otherwise get title
      //It is necessary depend of which plotly library version is installed on server
     const title = toRawType(plot.plot.layout.title) === 'Object' ? plot.plot.layout.title.text : plot.plot.layout.title;
     //add plot id
     this.state.positions.push(plot.id);
     //set relation to null
     plot.withrelations = null;
     /*
     * @since 3.5.1
     * data attribute store data
     * */
     plot.data = null;
     //set already loaded false
     plot.loaded = false;
     plot.plot.layout._title = title ;
     plot.label = title || `Plot id [${plot.id}]`;
     // set auto margin
     plot.plot.layout.xaxis.automargin = true;
     plot.plot.layout.yaxis.automargin = true;
     //end auto margin
     plot.filters = [];
     // get layer id
     const layerId = plot.qgs_layer_id;
     //add to Array layerId
     layersId.add(layerId);
     // listen layer change filter to reload the charts
     const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
     // check if layer has geometry
     const geolayer = layer.isGeoLayer();
     plot.crs = geolayer ? layer.getCrs() : undefined;
     plot.tools = {
       filter: layer.getFilter(), // get reactive layer filter attribute : {filter: {active: <Boolean>}}
       selection: layer.getSelection(), // get reactive layer selection attribute : {selection: {active: <Boolean>}}
       geolayer: Vue.observable({
         show: geolayer, // if is geolayer show map tool
         active: false, // start to false
       })
     };
     // check if a layer has child (relation)
     //so add withrerlations attribute to plot
     if (layer.isFather()) {
       const relations = [];
       layer.getRelations().getArray().forEach(relation =>{
         relation.getFather() === layerId && relations.push({
           id: relation.getId(), // relation id
           relationLayer: relation.getChild(), // relation layer child
         });
         this._relationIdName[relation.getId()] = relation.getName();
       });
       plot.withrelations = {
         relations,
         data: null
       }; // add Array relations

     }
     // listen layer change filtertokenchange
     layer.on('filtertokenchange', this.changeChartsEventHandler)

    });
    //
    BASEQPLOTLYAPIURL = `${BASEQPLOTLYAPIURL}/${this.getGid()}`;

    /**
     * @since 3.5.2
     * @returns {number}
     */
    this.getNumberOfShowPlots = function(){
      return this.getShowPlots(true).length;
    }

    /**
     * Method called from  queryResultService on 'show-chart' event
     * @param ids
     * @param container
     * @param relationData
     */
    this.showChartsOnContainer = (ids, container, relationData) => {
      const findContainer = this.chartContainers.find(queryresultcontainer => container.selector === queryresultcontainer.container.selector);
      if ("undefined" === typeof findContainer) {
        this.chartContainers.push({
          container,
          component: null
        });
      }
      this.showChart(("undefined" === typeof findContainer), ids, container, relationData);
    };
    // Emit plugin service is ready
    this.emit('ready');

    /**
     * Method to clear chart containers
     * @param container
     */
     this.clearChartContainers = (container) => {

       this.chartContainers = this.chartContainers.filter(queryResultsContainer =>  {
         if (!container || (container.selector === queryResultsContainer.container.selector)) {
           $(queryResultsContainer.component.$el).remove();
           queryResultsContainer.component.$destroy();
           return false
         } else return true;
       });
     };

     this.queryResultService.addLayersPlotIds([...layersId]);
     // listen show-chart event from query result service
     this.queryResultService.on('show-chart', this.showChartsOnContainer);
      // listen hide-chart event from query result service
     this.queryResultService.on('hide-chart', this.clearChartContainers);
     // get close component event key when component (right element where result are show is closed)
     this.closeComponentKeyEevent = this.queryResultService.onafter('closeComponent', this.clearChartContainers);

     this.setContentChartTools();
    };

  /**
   * Method to toggle filter token on project layer
   * @param layerId
   */
  this.toggleLayerFilter = function(layerId){
    const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
    if (layer) {
      layer.toggleFilterToken();
    }
  };

  /**
   * Method to set array of active filter on a plot
   * map bbox or filtertoken for example
   * @param plot
   */
  this.setActiveFilters = function(plot){
    let change = false;
    const _filters = [...plot.filters];
    plot.filters = [];
    //check if active filter filtertoken is active
    if (true === plot.tools.filter.active) {
      plot.filters.push('filtertoken');
    }
    //check if map bbox tools on plo is active
    if (true === plot.tools.geolayer.active) {
      plot.filters.length > 0 ?
        plot.filters.splice(0, 1, 'in_bbox_filtertoken') :
        plot.filters.push('in_bbox');
    }
  };

  /**
   * Get new data charts and emit change-charts listen by qplotly.vue component to redraw charts
   * @param plotIds
   * @returns {Promise<void>}
   */
  this.getChartsAndEmit = async function({plotIds} ={}){
    //get charts
    const {charts, order} = await this.getCharts({plotIds});
    // charts are change
    this.emit('change-charts', {charts, order})
  };

  /**
   * Method to show plot chart
   * @param plot
   * @returns {Promise<void>}
   */
  this.showPlot = async function(plot){
    // only if geolayer tools is show
    if (plot.tools.geolayer.show) {
      // get active boolean from map toggled
      plot.tools.geolayer.active = this.state.tools.map.toggled;
      // in case of already register move map event
      if (this.keyMapMoveendEvent.key) {
        // add current plot id
        this.keyMapMoveendEvent.plotIds.push({
          id: plot.id,
          active: this.state.tools.map.toggled
        })
      }
    }

    /**
     *  set main map geolayer tools based on if there are plot belong to a geolayer
     */
    this.setContentChartTools();
    // if there are chart to reload
    // in case of parent plot relations
    if (null !== plot.withrelations) {
      //need to check if other plot with the same qgs_layer_id has already
      //loaded child plot
      if ("undefined" === typeof this.getShowPlots(true).find((_plot) => _plot.id !== plot.id && _plot.qgs_layer_id === plot.qgs_layer_id)) {
        //not find a show plot with same qgs_layer_id
        this.getShowPlots().forEach((_plot) => {
          //find a child plot show
          if (_plot.id !== plot.id) {
            if ("undefined" !== typeof plot.withrelations.relations.find(({relationLayer}) => _plot.qgs_layer_id === relationLayer)) {
              //if found clear plot data to force to reload by parent plot
              this.clearDataPlot(_plot);
            }
          }
        })
      }
    }

    await this.getChartsAndEmit({plotIds: [plot.id]});

  };

  /**
   * Method to hide plot chart
   * @param plot
   * @returns {Promise<void>}
   * */
  this.hidePlot = async function(plot){
    // check if geolayer tool (map) is show (geolayer)
    if (plot.tools.geolayer.show) {
      // deactive geolayer tools
      plot.tools.geolayer.active = false;
      //check if there is a listen key moveend
      if (this.keyMapMoveendEvent.key) {
        // remove map Move end from plotids keys
        this.keyMapMoveendEvent.plotIds = this.keyMapMoveendEvent.plotIds.filter(plotId => plot.id !== plotId.id);
      }
      // if no plots have active geo tools
      if (this.keyMapMoveendEvent.plotIds.length === 0) {
        // set request params to undefined
        this.customParams.bbox = undefined;
        //un toggle main chart map tool
        this.state.tools.map.toggled = false;
      }
    }
    // clear data of plot
    this.clearDataPlot(plot);
    //
    this.setContentChartTools();
    // Remove filters eventually
    this.setActiveFilters(plot);
    //
    const {charts, order} = this.createChartsObject();
    // this is useful to Qplotly component to
    // update charts
    this.emit('show-hide-chart', {
      plotId: plot.id,
      action: 'hide',
      filter: plot.filters,
      charts,
      order,
    });
  };

  /**
   * TODO
   * @param order <Array/undefined> of plot ids
   * @returns {{charts: {}, order: (*|*[])}}
   */
  this.createChartsObject = function({order}={}){
    return {
      order: order || this.getShowPlots(true).map(plot => plot.id),
      charts: {},
    }
  };

  /**
   * Method to get charts plots of plugin configuration
   * @returns {[]|*}
   */
  this.getPlots = function(){
    return this.config.plots;
  };

  /**
   * TODO
   */
  this.clearLoadedPlots = function() {
    this.state.tools.map.toggled = false;
    this.customParams.bbox = undefined;
    this.handleKeyMapMoveendEvent({
      listen: false
    });
    this.getShowPlots(true).forEach(plot => {
      this.clearDataPlot(plot, false);
      if (true === plot.tools.geolayer.show) {
        plot.tools.geolayer.active = false;
      }
      plot.filters = [];
    });
    this.showCharts = false;
  };

  /**
   * TODO
   * @param force
   */
  this.setBBoxParameter = function(force=false){
    this.customParams.bbox = (force || true === this.state.tools.map.toggled) ? this.mapService.getMapBBOX().toString() : undefined;
  };

  /**
   * TODO
   * @param plotIds
   * @returns {Promise<unknown>}
   */
  this.updateMapBBOXData = async function({id, active}){
    const plotIds = [{
      id,
      active
    }]

    const plot = this.getPlotById(id);

    this.getShowPlots(true).forEach((_plot) => {
      if (_plot.id !== id && _plot.qgs_layer_id === plot.qgs_layer_id) {
        _plot.tools.geolayer.active = active;
        this.clearDataPlot(_plot, false);
        plotIds.push({
          id: _plot.id,
          active,
        })
      }
    })


    //set bbox parameter to force
    this.setBBoxParameter(true);

    this.mainbboxtool = false;

    this.handleKeyMapMoveendEvent({
      listen:true,
      plotIds,
    });

    this.clearDataPlot(plot, false);

    return await this.getCharts({
      plotIds: plotIds.map(({id}) => id)
    });
  };

  /**
   * Handle moveend map event
   * @param listen
   * @param plotIds
   */
  this.handleKeyMapMoveendEvent = function({listen=false, plotIds=[]}={}){
    if (listen) {
      // which plotIds need to be trigger the moveed map event
      this.keyMapMoveendEvent.plotIds = plotIds;
      // get map moveend event just one time
      if (null === this.keyMapMoveendEvent.key) {
        this.keyMapMoveendEvent.key = this.mapService.getMap().on('moveend', this.changeChartsEventHandler);
      }
    } else {
      // remove handler of moveend map
      ol.Observable.unByKey(this.keyMapMoveendEvent.key);
      this.keyMapMoveendEvent.key = null;
      // reset to empty
      this.keyMapMoveendEvent.plotIds = [];
    }
  };

  /**
   * Method reload chart data for every charts
   */
  this.updateCharts = async function(change=false){
    let charts;
    this.mainbboxtool = true;
    this.state.tools.map.toggled = change ? !this.state.tools.map.toggled: this.state.tools.map.toggled;
    //set bbox parameter
    this.setBBoxParameter();
    //get active plot related to geolayer
    const activeGeolayerPlots = this.getShowPlots(true).filter(plot => {
      if (true === plot.tools.geolayer.show) {
        plot.tools.geolayer.active = plot.tools.geolayer.show && this.state.tools.map.toggled;
        return (this.state.tools.map.toggled && plot.tools.geolayer.active) || true
      } else {
        return false;
      }
    });

    this.handleKeyMapMoveendEvent({
      listen: this.state.tools.map.toggled,
      plotIds: activeGeolayerPlots.map(plot => ({
        id: plot.id,
        active: plot.tools.geolayer.active
      }))
    });

    try {
      const plotIds = activeGeolayerPlots.map((plot) => {
        this.clearDataPlot(plot, false);
        return plot.id;
      });
      charts = await this.getCharts({
        plotIds
      });
    } catch(e){}

    return charts;
  };

  /**
   * @param plot object
   */
  this.clearDataPlot = function(plot, reloadChidPlots=true){
    //set loaded data to false
    plot.loaded = false;
    //set dat to null
    plot.data = null;
    //plotId eventually to reload
    const plotIds = [];
    //in case of plot father and has relation data
    if (null !== plot.withrelations) {
      //and data related to
      if (null !== plot.withrelations.data) {
        Object.values(plot.withrelations.data)
            .forEach((dataRelationPlot) => {
              dataRelationPlot.forEach(({id}) => {
                this.clearDataPlot(this.getPlotById(id));
                plotIds.push(id);
              })
            })
        plot.withrelations.data = null;
        if (true === reloadChidPlots && plotIds.length > 0) {
          this.getChartsAndEmit({
            plotIds
          })
        }
      }
    } else {
      //check if we need to remove relation data coming from parent plot
      this.getShowPlots(true).forEach((_plot) => {
        //plot has different id from current hide plot and it has dara relations
        if (_plot.id !== plot.id && null !== _plot.withrelations && null !==_plot.withrelations.data) {
          Object.entries(_plot.withrelations.data).forEach(([relationId, dataRelationPlot]) => {
            dataRelationPlot.forEach(({id}, index) => {
              if (id === plot.id) {
                dataRelationPlot.splice(index, 1);
              }
            })
            if (dataRelationPlot.length === 0) {
              delete _plot.withrelations.data[relationId];
              if (Object.keys(_plot.withrelations.data).length === 0) {
                _plot.withrelations.data = null;
              }
            }
          })
        }
      })
    }
    return plotIds;
  }

  /**
   * method to set geo-layer tools true or false if some plot chart has geolayer show
   */
  this.setContentChartTools = function(){
    // if no show plot have geolayer tool to show (geolayer) hide charts geolayer tool
    this.state.geolayer = "undefined" !== typeof this.getShowPlots(true).find(plot => plot.tools.geolayer.show);
  };

  /**
   * Method to show loading charts data (loading === true)
   * is on going
   * @param loading <Boolean>
   * @returns {undefined}
   */
  this.setLoadingCharts = function(loading){
    this.state.loading = loading;

    if ("undefined" === typeof this.relationData) {
      GUI.disableSideBar(loading);
      GUI.setLoadingContent(loading);
    }

  };

  /**
   * Return filter plots base on show parameter
   * @param show <Boolean>
   * @returns {Array} filtered plots
   */
  this.getShowPlots = function(show=true){
    return this.config.plots.filter(plot => show === plot.show);
  };

  /**
   * @since 3.5.2
   */
  this.getPlotById = function(id){
    return this.config.plots.find((plot) => plot.id === id);
  };

  /**
   * Method to get data charts from server
   * @param layerIds // provide by query by result service otherwise is undefined
   * @param plotIds // <Array> of plots id to show
   * @param relationData // provide by query by result service otherwise is undefined
   * @returns {Promise<unknown>}
   */
  this.getCharts = async function({layerIds, plotIds, relationData}={}){
    console.log({layerIds, plotIds, relationData})
    // check if it has relation data
    this.relationData = relationData;
    //return a Promise
    return new Promise((resolve) => {
      this.setLoadingCharts(true);
      let plots; // array of plots that need to be get data to show charts
      if ("undefined" !== typeof layerIds) {
        //get plots request from Query Result Service
        plots = this.config.plots.filter(plot => layerIds.indexOf(plot.qgs_layer_id) !== -1);
      } else if ("undefined" !== typeof plotIds) {
        //filter only plots that have id belong to plotIds array
        //set by check uncheck plot on sidebar interface
        plots = [];
        plotIds.forEach((plotId) => {
          //check if is child of already show plots
          let addPlot = this.getShowPlots(true).find(plot => {
            return (
              (
                (plot.id !== plotId) &&
                (null !== plot.withrelations) &&
                // find a plot that has withrelations array and with relationLayer the same
                // layer id belong to plot qgis_layer_id
                ("undefined" !== typeof plot.withrelations.relations.find(({id:relationId, relationLayer}) => (
                  (relationLayer === this.getPlotById(plotId).qgs_layer_id) &&
                  (
                    (null === plot.withrelations.data) ||
                    ("undefined" === typeof plot.withrelations.data[relationId]) ||
                    ("undefined" === typeof plot.withrelations.data[relationId].find(({id}) => id === plotId))
                  ))
                ))
              )
            )
          })
          //if not find add plot by plotId
          if ("undefined" === typeof addPlot) {
            addPlot = this.getPlotById(plotId)
          }
          //check if already (in case of parent plots) added to plots
          if ("undefined" === typeof plots.find((plot) => plot === addPlot)){
            plots.push(addPlot);
          }
        })
      } else {
        // get only plots that have attribute show to true
        // and not in relation with other plot show
        plots = this.getShowPlots(true).filter(plot => {
          return (
            // and if not belong to show plot father relation
            ("undefined" === typeof this.getShowPlots(true).find((_plot) =>
            (
              // is not the same plot id
              (plot.id !== _plot.id) &&
              // plat has relations
              (null !== _plot.withrelations) &&
              // find a plot that has withrelations array and with relationLayer the same
              // layer id belog to plot qgis_layer_id
              ("undefined" !== typeof _plot.withrelations.relations.find(({id, relationLayer}) => ((relationLayer === plot.qgs_layer_id))))
            )))
          )
        })
      }
      // create charts Object
      const chartsObject = this.createChartsObject({
        order: layerIds && plots.map(plot => plot.id)
      });
      // set main map visible filter tool
      // check if is supported
      if (Promise.allSettled) {
        // create promises array
        const promises = [];
        // TODO
        const chartsplots = [];
        // set that register already relation loaded to avoid to replace the same plot multi time
        const relationIdAlreadyLoaded = new Set();
        //loop through array plots
        plots.forEach(plot => {
          let promise;
          let plotRelationData;//variable contain already data coming from father plots
          // in case of no request (relation) and not called from query
          if (
              //if already loaded (show)
              (true === plot.loaded) &&
              (
                (null === plot.withrelations) ||
                (
                  (null !== plot.withrelations.data) &&
                  (
                    (
                      this.getShowPlots(true)
                        .filter((_plot)=> ("undefined" !== typeof plot.withrelations.relations.find(({relationLayer}) => (_plot.qgs_layer_id === relationLayer))))
                        .reduce((notChildPlotData, _plot) => {
                          notChildPlotData += (
                            "undefined" !== typeof Object.values(plot.withrelations.data).find((relationData) => {
                              return ("undefined" !== typeof relationData.find(({id, data}) => id === _plot.id))
                            })
                          ) ? 0: 1;
                          return notChildPlotData
                        }, 0) === 0
                    )
                  )
                )
              )
          ) {
            promises.push(Promise.resolve({
              result: true,
              data: plot.data,
              relations: plot.withrelations && plot.withrelations.data
            }));
          } else if (
            // no relation data passed by query result service
            ("undefined" === typeof relationData) &&
            //check if plots are more than one
            (this.getShowPlots(true).length > 1) &&
            //find if is a plots that belong to plot father
            ("undefined" !== typeof this.getShowPlots(true).find((_plot)=> {
              if (
                (_plot.id !== plot.id) &&
                (null !== _plot.withrelations) &&
                (null !== _plot.withrelations.data) &&
                ("undefined" !== typeof Object.values(_plot.withrelations.data).find((relationData) => {
                  return "undefined" !== typeof relationData.find(({id, data}) => {
                    if (id === plot.id) {
                      plotRelationData = data;
                      return true;
                    }
                  })
                }))
              ) {
                  promises.push(Promise.resolve({
                    result: true,
                    data: [plotRelationData]
                  }))

                  return true;
                }
            }))
          ) {

          } else {
            //check if we need to add bbox parameter to request
            const addInBBoxParam= this.keyMapMoveendEvent.plotIds.length > 0 ?

              this.keyMapMoveendEvent.plotIds
                .filter(plotIds => plotIds.active)
                .map(plotId => plotId.id)
                .indexOf(plot.id) !== -1 :
              true;

            //withrealtion get parameter.
            // Initialize as undefined
            let withrelations;
            //check if plot has relation child
            if (plot.withrelations) {
              withrelations = plot.withrelations.relations.filter(({id:relationId, relationLayer}) => {
                if (
                    ("undefined" !== typeof this.getShowPlots(true).find((_plot) => {
                      return (
                        (_plot.qgs_layer_id === relationLayer) &&
                        (false === _plot.loaded)
                      )
                    })) && (false === relationIdAlreadyLoaded.has(relationId))
                ) {
                  relationIdAlreadyLoaded.add(relationId);
                  plot.loaded = false;
                  return true;
                }
              }).map(({id}) => id).join(',') || undefined;
              console.log(withrelations)
            }
            //set initial to undefined
            let relationsonetomany = [undefined];

            //in_bbox parameter in case of tool map toggled
            const in_bbox = (addInBBoxParam && this.customParams.bbox) ? this.customParams.bbox : undefined;

            //case called by Query result service
            if ("undefined" !== typeof this.relationData) {
              const chartsRelations = this.relationData.relations
                .filter(relation => plot.qgs_layer_id === relation.referencingLayer)
                .map(relation => `${relation.id}|${this.relationData.fid}`);
              relationsonetomany = chartsRelations.length ? chartsRelations : relationsonetomany;
            }

            relationsonetomany.forEach(relationonetomany => {
              chartsplots.push(plot);
              promise = true === plot.loaded ?

                Promise.resolve({
                  data: plot.data
                }) :
                // server request data
                XHR.get({
                  url: `${BASEQPLOTLYAPIURL}/${plot.qgs_layer_id}/${plot.id}/`,
                  params: {
                    withrelations, // relations parameter
                    filtertoken: ApplicationState.tokens.filtertoken || undefined, //filtertoken
                    relationonetomany,
                    in_bbox //in bbox
                  }
                });

              promises.push(promise);

            })
          }
        });
        // wait all promises
        Promise.allSettled(promises)
          .then(async promisesData => {
            promisesData.forEach((promise, index) => {
              // only if request has response
              if (promise.status === 'fulfilled' && promise.value.result) {
                const {data, relation, relations} = promise.value;
                if (relation) return; // in case of relation do nothing
                const plot = chartsplots[index];
                plot.data = data;
                plot.loaded = true;
                plot.plot.layout.title = plot.plot.layout._title;
                this.setActiveFilters(plot);
                // in case of multiple chart plot of same plot
                const chart = {};
                if (chartsObject.charts[plot.id]) {
                  chartsObject.charts[plot.id].push(chart);
                } else {
                  chartsObject.charts[plot.id] = [chart];
                }
                chart.filters = plot.filters;
                chart.layout = plot.plot.layout;
                chart.tools = plot.tools;
                chart.layerId = plot.qgs_layer_id;
                chart.title = plot.plot.layout.title;
                chart.data = data[0];
                //in case of return data has a relations attributes data
                if (relations) {
                  //add data to relations
                  if (null === plot.withrelations.data){
                    plot.withrelations.data = relations;
                  } else {
                    Object.keys(relations).forEach((relationId) => {
                      plot.withrelations.data[relationId] = relations[relationId]
                    })
                  }
                  //loop through relations id plot
                  Object.keys(relations).forEach(relationId => {
                    //get relation data
                    relations[relationId].forEach(({id, data}) => {
                      //get father filter plots
                      const fatherPlotFilters = plot.filters;
                      //filter only show plot
                      this.config.plots.filter(plot => plot.show)
                        .find((plot, index) => {
                          if (plot.id === id) {
                            this.setActiveFilters(plot);
                            plot.loaded = true;
                            plot.data = data;
                            const chart = {};
                            if (chartsObject.charts[plot.id]) chartsObject.charts[plot.id].push(chart);
                            else chartsObject.charts[plot.id] = [chart];
                            const layout = plot.plot.layout;
                            layout.title = `${this._relationIdName[relationId]} ${layout._title}`;

                            if (fatherPlotFilters.length) {
                              plot.filters.push(`relation.${fatherPlotFilters[0]}`);
                            }

                            chart.data = data[0];
                            chart.filters= plot.filters;
                            chart.layout = layout;
                            chart.tools = plot.tools;
                            chart.layerId = plot.qgs_layer_id;
                            chart.title = plot.plot.layout.title;
                            return true;
                        }
                      });
                    })
                  });
                }
              } else { // some error occurs during get data from server
                const plot = chartsObject[index];
                this.setActiveFilters(plot);
                const chart = {};
                if (chartsObject.charts[plot.id]) {
                  chartsObject.charts.push(chart);
                } else {
                  chartsObject.charts = [chart];
                }
                chart.filters = plot.filters;
                chart.layout = plot.plot.layout;
                chart.tools = plot.tools;
                chart.layerId = plot.qgs_layer_id;
                chart.title = plot.plot.layout.title;
                chart.data = null;
              }
            });

            this.showCharts = true;

            this.removeInactivePlotIds();

            resolve(chartsObject);
          })
      }
      this.setLoadingCharts(false);
    });
  };

  /**
   *
   */
  this.removeInactivePlotIds = function(){
    if (false === this.state.tools.map.toggled){
      this.keyMapMoveendEvent.plotIds = this.keyMapMoveendEvent.plotIds.filter(plotId => plotId.active);
      if (this.keyMapMoveendEvent.plotIds.length === 0 && this.keyMapMoveendEvent.key ) {
        this.handleKeyMapMoveendEvent({listen: false});
      }
    }
  };

  /**
   *
   * @returns {*}
   */
  this.getChartLayout = function() {
    return this.config.plots[0].layout;
  };
  /**
   *
   * @returns {*}
   */
  this.getChartConfig = function(){
    return this.config.plots[0].config;
  };

  /**
   * Called when queryResultService emit event show-chart
   * or open/close sidebar item
   * @param bool <Boolean>
   * @param ids <Array> passed by query result services
   * @param container DOM element - passed by query result service
   * @param relationData Passed by query result service
   * @returns {Promise<unknown>}
   */
  this.showChart = function(bool, ids, container, relationData){
    return new Promise(resolve => {
      // check if set true (show chart)
      if (true === bool) {
        // need to be async
        setTimeout(()=>{
          // create QPlotly Component
          const content =  new QPlotlyComponent({
            service: this,
            ids,
            relationData
          });

          // get Internal (Vue) component of g3w Component
          const component = content.getInternalComponent();
          // called by sidebar item
          if ("undefined" === typeof container) {
            // once chartsReady event resolve promise
            //set self variable to refer to service
            const self = this;
            GUI.showContent({
              closable: false,
              title: 'plugins.qplotly.title',
              style: {
                title: {
                  fontSize: '1.3em'
                }
              },
              //set header action tools (ex. map filter)
              headertools: [
                Vue.extend({
                  ...HeaderContentAction,
                  data(){
                    return {
                      state: self.state,
                      tools: {
                        map: {
                          show: self.state.geolayer && !self.relationData,
                          disabled: true
                        }
                      }
                    }
                  },
                  methods: {
                    async updateCharts(){
                      const {charts, order } = await self.updateCharts(true);
                      await this.$nextTick();
                      self.emit('change-charts',{
                        charts,
                        order
                      });
                    }
                  }
                })
              ],
              content
            });
          } else {//if not called from Query Result Service
            component.$once('hook:mounted', async function(){
              container.append(this.$el);
            });
            component.$mount();
            this.chartContainers.find(queryResultsContainer => container.selector === queryResultsContainer.container.selector).component = component;
          }
        })
      } else {
        if ("undefined" === typeof container) {
          GUI.closeContent();
        } else {
          this.clearChartContainers(container);
        }
        resolve();
      }
    })
  };

  /**
   * Clear method
   */
  this.clear = function(){
    GUI.removeComponent('qplotly', 'sidebar', {position: 1});
    GUI.closeContent();
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
    layersId = null;
    this.mainbboxtool = null;
    this.queryResultService = null;
    this.emit('clear');
  };

}

inherit(Service, PluginService);

export default new Service();

 