<template>
  <div style="width:100%">
    <div class="skin-background-color" style="display:flex; width: 100%; font-weight: bold; padding: 2px; min-height: 20px; font-size: 1.2em; text-align: center; color: #FFFFFF">
      <div style="margin:auto">{{ title }}</div>
      <div v-if="showtools" class="plot-tools" style="background-color: #FFFFFF; padding: 2px; font-size: 1.0em; border-radius: 3px">
        <span v-if="tools.selection.active" style="margin: auto" class="action-button skin-tooltip-left" @click="toggleFilter" :class="{'toggled': tools.filter.active}" data-placement="left" data-toggle="tooltip" v-t-tooltip="'layer_selection_filter.tools.filter'">
          <span  class="action-button-icon" :class="g3wtemplate.getFontClass('filter')"></span>
        </span>
        <span v-if="tools.geolayer.show" style="margin: auto" class="action-button skin-tooltip-left" :class="{'toggled': tools.geolayer.active }" @click="toggleBBoxTool" data-placement="left" data-toggle="tooltip" v-t-tooltip="'layer_selection_filter.tools.filter'">
          <span  class="action-button-icon" :class="g3wtemplate.getFontClass('map')"></span>
        </span>
      </div>
    </div>
    <ul class="skin-color" style="margin-top: 5px; list-style-type: none; background-color: #FFFFFF; padding-left: 3px; font-weight: bold">
      <li v-for="filter in filters" v-t-plugin="`qplotly.filters.${filter}`"></li>
    </ul>
  </div>
  
</template>

<script>
  export default {
    name: "plotheader",
    props:{
      index: {
        tyep: Number
      },
      layerId:{
        type: String
      },
      title: {
        type: String,
        default: ""
      },
      tools: {
        type: Object,
        default: {
          filter: {
           active: false
          },
          selection: {
           active: true
          },
          geolayer: {
            show: false,
            active: false
          }
        }
      },
      filters: {
        type: Array,
        default: []
      }
    },
    computed: {
      showtools(){
        return this.tools.geolayer.show || this.tools.selection.active;
      }
    },
    methods: {
      toggleFilter(){
        this.$emit('toggle-filter-tool', {
          layerId: this.layerId
        })
      },
      toggleBBoxTool(){
        this.tools.geolayer.active = !this.tools.geolayer.active;
        this.$emit('toggle-bbox-tool', {index:this.index, active:this.tools.geolayer.active});
      }
    }
  }
</script>

<style scoped>

</style>