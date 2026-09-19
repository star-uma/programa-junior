// Acceso: iniciar sesión o crear el perfil de junior.
import { estado } from '../estado.js';
import { esc, icon, avatar, aviso, dialogo, pintarIconos } from '../ui.js';

export function vistaAcceso(main) {
  const demo = estado.store.modo === 'demo';
  main.innerHTML = `
  <div class="acceso">
    <section class="acceso__intro">
      <img class="acceso__banner" src="assets/banner.jpg" alt="UMA Experience · STAR, Student Team of Advanced Robotics">
      <h1>Tu camino de Junior a Senior</h1>
      <p class="lead">Sigue tu progreso en las habilidades del equipo, desbloquea hitos como el acceso autónomo al taller y descubre qué te falta para ser Senior.</p>
      <ul class="acceso__puntos">
        <li>${icon('radar')}Tu perfil de habilidades de un vistazo</li>
        <li>${icon('key-round')}Hitos y permisos que vas desbloqueando</li>
        <li>${icon('badge-check')}Validado por seniors: tu progreso es real</li>
      </ul>
      <p><a href="#/programa">Ver el programa completo ${icon('arrow-right')}</a></p>
    </section>

    <section class="tarjeta acceso__caja">
      <div class="pestanas" role="tablist">
        <button role="tab" aria-selected="true" data-pestana="entrar">Entrar</button>
        <button role="tab" aria-selected="false" data-pestana="registro">Crear perfil</button>
      </div>
      <div data-panel="entrar">${demo ? entrarDemo() : entrarReal()}</div>
      <div data-panel="registro" hidden>${registro(demo)}</div>
    </section>
  </div>`;

  if (demo) pintarUsuariosDemo(main);

  main.onclick = async (e) => {
    const tab = e.target.closest('[data-pestana]');
    if (tab) {
      main.querySelectorAll('[data-pestana]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      main.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.pestana; });
      return;
    }
    const usuario = e.target.closest('[data-demo-usuario]');
    if (usuario) await estado.store.entrarComo(usuario.dataset.demoUsuario);
    if (e.target.closest('[data-accion="recuperar"]')) recuperar(main);
  };

  main.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const d = Object.fromEntries(new FormData(form));
    const boton = form.querySelector('button[type=submit]');
    const error = form.querySelector('.form-error');
    boton.disabled = true;
    error.hidden = true;
    try {
      if (form.dataset.form === 'entrar') {
        await estado.store.entrar({ email: d.email.trim(), password: d.password });
      } else {
        const r = await estado.store.registrar({
          email: (d.email ?? '').trim(), password: d.password, nombre: d.nombre.trim(), departamento: d.departamento,
        });
        if (r.confirmar) {
          form.innerHTML = `<div class="banda banda--acento">${icon('mail')}<p><strong>Revisa tu correo.</strong> Te hemos enviado un enlace para confirmar la cuenta. Después podrás entrar.</p></div>`;
          pintarIconos();
        }
      }
    } catch (ex) {
      error.textContent = ex.message;
      error.hidden = false;
      boton.disabled = false;
    }
  };
}

function entrarReal() {
  return `
  <form data-form="entrar" class="form">
    <label class="campo"><span>Correo</span><input type="email" name="email" autocomplete="email" required></label>
    <label class="campo"><span>Contraseña</span><input type="password" name="password" autocomplete="current-password" required></label>
    <p class="form-error" hidden></p>
    <button type="submit" class="boton boton--primario boton--bloque">Entrar</button>
    <button type="button" class="enlace" data-accion="recuperar">¿Has olvidado la contraseña?</button>
  </form>`;
}

function entrarDemo() {
  return `
  <div class="banda banda--neutro">${icon('flask-conical')}<p><strong>Modo demo.</strong> Elige con qué usuario entrar para ver la app como junior o como senior. Los cambios se guardan solo en este navegador.</p></div>
  <div class="demo-usuarios" id="demo-usuarios"><p class="meta">Cargando…</p></div>`;
}

async function pintarUsuariosDemo(main) {
  const usuarios = await estado.store.usuariosDemo();
  const grupo = (titulo, lista) => `
    <h3 class="subtitulo">${titulo}</h3>
    <ul class="lista-usuarios">${lista.map((p) => `<li><button class="usuario-demo" data-demo-usuario="${esc(p.id)}">${avatar(p)}<span><strong>${esc(p.nombre)}</strong><span class="meta">${esc(p.departamento ?? '')}</span></span>${icon('chevron-right')}</button></li>`).join('')}</ul>`;
  const caja = main.querySelector('#demo-usuarios');
  if (!caja) return;
  caja.innerHTML = grupo('Juniors', usuarios.filter((p) => p.rol === 'junior')) + grupo('Seniors (pueden validar)', usuarios.filter((p) => p.rol === 'senior'));
  pintarIconos();
}

function registro(demo) {
  const departamentos = estado.programa.departamentos;
  return `
  <form data-form="registro" class="form">
    <p class="meta">Crea tu perfil de junior. Tu progreso solo lo pueden validar los seniors del equipo.</p>
    <label class="campo"><span>Nombre y apellido</span><input name="nombre" autocomplete="name" required minlength="2" maxlength="80"></label>
    <label class="campo"><span>Departamento</span><select name="departamento" required><option value="" disabled selected>Elige tu departamento</option>${departamentos.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
    ${demo ? '' : `
      <label class="campo"><span>Correo</span><input type="email" name="email" autocomplete="email" required></label>
      <label class="campo"><span>Contraseña</span><input type="password" name="password" autocomplete="new-password" required minlength="8"><small class="meta">Mínimo 8 caracteres</small></label>`}
    <p class="form-error" hidden></p>
    <button type="submit" class="boton boton--primario boton--bloque">${icon('user-plus')}Crear mi perfil</button>
  </form>`;
}

async function recuperar(main) {
  const email = main.querySelector('[data-form="entrar"] [name=email]')?.value ?? '';
  const r = await dialogo({
    titulo: 'Recuperar contraseña',
    cuerpo: `<p class="meta">Te enviaremos un enlace para crear una contraseña nueva.</p>
      <label class="campo"><span>Correo</span><input type="email" name="email" required value="${esc(email)}"></label>`,
    acciones: [{ id: 'ok', texto: 'Enviar enlace', tipo: 'primario' }],
    alEnviar: (_a, d) => estado.store.recuperar(d.email.trim()),
  });
  if (r) aviso('Si el correo existe, te llegará un enlace en unos minutos');
}

// Tras pulsar el enlace del correo de recuperación, Supabase abre la app con una sesión temporal.
export async function pedirNuevaPassword() {
  const r = await dialogo({
    titulo: 'Nueva contraseña',
    cuerpo: `<label class="campo"><span>Contraseña nueva</span><input type="password" name="password" autocomplete="new-password" required minlength="8"></label>`,
    acciones: [{ id: 'ok', texto: 'Guardar', tipo: 'primario' }],
    alEnviar: (_a, d) => estado.store.cambiarPassword(d.password),
  });
  if (r) aviso('Contraseña actualizada');
}
