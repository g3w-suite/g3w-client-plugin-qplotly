module.exports = {
  props:{
    title: {
      type: String
    }
  },
  render(h){
    return h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        justifyContent: 'center'
      }
    }, [
      h('h4', {
        style: {
          fontWeight: 'bold',
          textAlign: 'center'
        },
        class:{
          'skin-color':true
        }
      },`${this.$props.title}`),
      h('div', {
        directives: [{
          name:'t-plugin',
          value: 'qplotly.no_data'
        }],
        style: {
          fontWeight: 'bold'
        },
        class: {
          'skin-color': true
        }
      })
    ])
  }
};